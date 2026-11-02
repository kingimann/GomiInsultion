-- Gomi Insulation schema. Run in the Supabase SQL editor (or via the management API).
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '', email text not null default '',
  is_admin boolean not null default false, created_at timestamptz not null default now());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email) values (new.id, coalesce(new.raw_user_meta_data->>'name',''), new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false) $$;

create table if not exists public.products (
  id bigint generated always as identity primary key, slug text unique not null, name text not null,
  category text not null, description text not null default '', price_cents int not null check (price_cents >= 0),
  unit text not null default 'each', r_value text not null default '', stock int not null default 0 check (stock >= 0),
  image_url text not null default '', active boolean not null default true);

create table if not exists public.orders (
  id bigint generated always as identity primary key, user_id uuid references auth.users(id),
  guest_key uuid not null default gen_random_uuid(),
  email text not null, name text not null, phone text not null default '', address text not null,
  city text not null, postcode text not null, notes text not null default '',
  status text not null default 'pending' check (status in ('pending','paid','shipped','delivered','cancelled')),
  subtotal_cents int not null, shipping_cents int not null, total_cents int not null,
  created_at timestamptz not null default now());

create table if not exists public.order_items (
  id bigint generated always as identity primary key, order_id bigint not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id), name text not null, price_cents int not null, qty int not null check (qty > 0));

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
drop policy if exists "view products" on public.products;
create policy "view products" on public.products for select using (active or public.is_admin());
drop policy if exists "admin write products" on public.products;
create policy "admin write products" on public.products for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "own orders" on public.orders;
create policy "own orders" on public.orders for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "own order items" on public.order_items;
create policy "own order items" on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

-- Place an order. Prices and stock come from the database, never from the browser.
create or replace function public.place_order(items jsonb, customer jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid;
  free_over int := 50000; flat int := 1500;
begin
  if jsonb_array_length(items) = 0 then raise exception 'Cart is empty'; end if;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint and active for update;
    if not found or q < 1 or p.stock < q then raise exception 'Not enough stock for %', coalesce(p.name, 'an item'); end if;
    sub := sub + p.price_cents * q;
  end loop;
  ship := case when sub >= free_over then 0 else flat end;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), customer->>'address',
          customer->>'city', customer->>'postcode', coalesce(customer->>'notes',''), sub, ship, sub + ship)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name, p.price_cents, q);
    update products set stock = stock - q where id = p.id;
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $$;

create or replace function public.get_guest_order(oid bigint, k uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'guest_key' || jsonb_build_object('items',
    (select coalesce(jsonb_agg(to_jsonb(i)), '[]') from order_items i where i.order_id = o.id))
  from orders o where o.id = oid and o.guest_key = k $$;

create or replace function public.set_order_status(oid bigint, new_status text) returns void
language plpgsql security definer set search_path = public as $$
declare old text; i record;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select status into old from orders where id = oid for update;
  if old is null then raise exception 'No such order'; end if;
  if new_status = 'cancelled' and old <> 'cancelled' then
    for i in select * from order_items where order_id = oid loop update products set stock = stock + i.qty where id = i.product_id; end loop;
  elsif old = 'cancelled' and new_status <> 'cancelled' then
    for i in select * from order_items where order_id = oid loop update products set stock = greatest(0, stock - i.qty) where id = i.product_id; end loop;
  end if;
  update orders set status = new_status where id = oid;
end $$;

revoke all on function public.get_guest_order(bigint, uuid), public.place_order(jsonb, jsonb), public.set_order_status(bigint, text) from public;
grant execute on function public.get_guest_order(bigint, uuid), public.place_order(jsonb, jsonb) to anon, authenticated;
grant execute on function public.set_order_status(bigint, text) to authenticated;

insert into public.products (slug,name,category,description,price_cents,unit,r_value,stock) values
 ('fiberglass-batts-r13','Fiberglass Batts R-13','Batts & Rolls','Classic unfaced fiberglass batts for 2x4 walls.',4999,'bundle (88 sq ft)','R-13',120),
 ('fiberglass-batts-r19','Fiberglass Batts R-19','Batts & Rolls','Fits 2x6 framing and standard floor joists.',6999,'bundle (80 sq ft)','R-19',90),
 ('mineral-wool-r15','Mineral Wool Batts R-15','Batts & Rolls','Fire resistant, water repellent, excellent acoustic performance.',8999,'bundle (60 sq ft)','R-15',60),
 ('spray-foam-kit-600','Closed-Cell Spray Foam Kit (600 bf)','Spray Foam','Two-component kit for sealing gaps, rim joists and small walls.',52900,'kit','R-6.5/in',25),
 ('spray-foam-can','Expanding Foam Sealant Can','Spray Foam','Fill gaps and cracks around windows, doors and penetrations.',899,'can (500 ml)','',300),
 ('xps-board-2in','XPS Rigid Foam Board 2"','Rigid Board','Moisture-resistant extruded polystyrene for foundations and basements. 4x8 ft sheet.',3499,'sheet (4x8)','R-10',150),
 ('polyiso-board-1in','Polyiso Foil-Faced Board 1"','Rigid Board','Highest R-value per inch of any rigid board.',2899,'sheet (4x8)','R-6',110),
 ('blown-cellulose','Blown-In Cellulose','Loose Fill','Recycled-content attic insulation. Covers about 40 sq ft at R-19.',2199,'bag (25 lb)','R-3.7/in',200),
 ('attic-baffles','Attic Rafter Vent Baffles','Accessories','Keeps soffit vents clear when adding attic insulation.',249,'each','',500),
 ('vapour-barrier-6mil','Poly Vapour Barrier 6 mil','Accessories','Clear polyethylene sheeting, 10 x 100 ft roll.',6499,'roll','',70),
 ('sealing-tape','Acoustic Sealant & Tape Kit','Accessories','Sealing tape and acoustical sealant for air-tight assemblies.',1999,'kit','',80)
on conflict (slug) do nothing;

-- Quote requests (anyone can submit; only admins can read)
create table if not exists public.quotes (
  id bigint generated always as identity primary key, user_id uuid references auth.users(id),
  name text not null check (length(name) between 1 and 200), email text not null check (length(email) between 3 and 200),
  phone text not null default '' check (length(phone) <= 50), message text not null check (length(message) between 1 and 5000),
  created_at timestamptz not null default now());
alter table public.quotes enable row level security;
drop policy if exists "submit quote" on public.quotes;
create policy "submit quote" on public.quotes for insert with check (user_id is null or user_id = auth.uid());
drop policy if exists "admin read quotes" on public.quotes;
create policy "admin read quotes" on public.quotes for select using (public.is_admin());

-- Product photos: public bucket, only admins can upload/change/delete
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
drop policy if exists "admin upload images" on storage.objects;
create policy "admin upload images" on storage.objects for insert with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admin update images" on storage.objects;
create policy "admin update images" on storage.objects for update using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "admin delete images" on storage.objects;
create policy "admin delete images" on storage.objects for delete using (bucket_id = 'product-images' and public.is_admin());

-- Payment helpers: callable only by the Stripe edge functions (service role)
create or replace function public.mark_order_paid(oid bigint) returns void language sql security definer set search_path = public as $$
  update orders set status = 'paid' where id = oid and status = 'pending' $$;
create or replace function public.cancel_unpaid_order(oid bigint) returns void language plpgsql security definer set search_path = public as $$
declare i record;
begin
  perform 1 from orders where id = oid and status = 'pending' for update;
  if not found then return; end if;
  for i in select * from order_items where order_id = oid loop update products set stock = stock + i.qty where id = i.product_id; end loop;
  update orders set status = 'cancelled' where id = oid;
end $$;
revoke all on function public.mark_order_paid(bigint), public.cancel_unpaid_order(bigint) from public, anon, authenticated;
grant execute on function public.mark_order_paid(bigint), public.cancel_unpaid_order(bigint) to service_role;

-- Owner becomes admin automatically once their email address is CONFIRMED (email confirmation must stay on).
create or replace function public.promote_owner() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and lower(new.email) = 'ifakhargomi@gmail.com' then
    update public.profiles set is_admin = true where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users for each row execute function public.promote_owner();

-- Discount codes
alter table public.orders add column if not exists discount_cents int not null default 0;
alter table public.orders add column if not exists promo_code text;
create table if not exists public.discount_codes (
  code text primary key check (code = upper(code)), percent int not null check (percent between 1 and 100),
  min_cents int not null default 0, active boolean not null default true);
alter table public.discount_codes enable row level security;
drop policy if exists "admin codes" on public.discount_codes;
create policy "admin codes" on public.discount_codes for all using (public.is_admin()) with check (public.is_admin());
insert into public.discount_codes (code, percent) values ('WELCOME10', 10) on conflict do nothing;

create or replace function public.check_code(c text, subtotal int) returns int language sql stable security definer set search_path = public as $$
  select percent from discount_codes where code = upper(trim(c)) and active and subtotal >= min_cents $$;
grant execute on function public.check_code(text, int) to anon, authenticated;

create or replace function public.place_order(items jsonb, customer jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := 50000; flat int := 1500;
begin
  if jsonb_array_length(items) = 0 then raise exception 'Cart is empty'; end if;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint and active for update;
    if not found or q < 1 or p.stock < q then raise exception 'Not enough stock for %', coalesce(p.name, 'an item'); end if;
    sub := sub + p.price_cents * q;
  end loop;
  if code is not null then
    pct := public.check_code(code, sub);
    if pct is null then raise exception 'That discount code is not valid'; end if;
    disc := sub * pct / 100;
  end if;
  ship := case when sub - disc >= free_over then 0 else flat end;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), customer->>'address',
          customer->>'city', customer->>'postcode', coalesce(customer->>'notes',''), sub, ship, sub - disc + ship, disc, code)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name, p.price_cents, q);
    update products set stock = stock - q where id = p.id;
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $$;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;

-- Reviews
create table if not exists public.reviews (
  id bigint generated always as identity primary key, product_id bigint not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(), author text not null default '',
  rating int not null check (rating between 1 and 5), comment text not null default '' check (length(comment) <= 2000),
  created_at timestamptz not null default now(), unique (product_id, user_id));
alter table public.reviews enable row level security;
drop policy if exists "read reviews" on public.reviews;
create policy "read reviews" on public.reviews for select using (true);
drop policy if exists "write own review" on public.reviews;
create policy "write own review" on public.reviews for insert with check (user_id = auth.uid());
drop policy if exists "delete review" on public.reviews;
create policy "delete review" on public.reviews for delete using (user_id = auth.uid() or public.is_admin());
create or replace function public.set_review_author() returns trigger language plpgsql security definer set search_path = public as $$
begin new.author := coalesce((select nullif(name,'') from profiles where id = new.user_id), 'Customer'); return new; end $$;
drop trigger if exists review_author on public.reviews;
create trigger review_author before insert on public.reviews for each row execute function public.set_review_author();
create or replace view public.product_ratings as
  select product_id, round(avg(rating)::numeric, 1)::float8 as avg, count(*)::int as count from public.reviews group by product_id;
grant select on public.product_ratings to anon, authenticated;

-- Saved addresses
create table if not exists public.addresses (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  label text not null default 'Home' check (length(label) <= 60), name text not null, phone text not null default '',
  address text not null, city text not null, postcode text not null, is_default boolean not null default false,
  created_at timestamptz not null default now());
alter table public.addresses enable row level security;
drop policy if exists "own addresses" on public.addresses;
create policy "own addresses" on public.addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Extra product photos (gallery)
create table if not exists public.product_images (
  id bigint generated always as identity primary key, product_id bigint not null references public.products(id) on delete cascade,
  url text not null, position int not null default 0);
alter table public.product_images enable row level security;
drop policy if exists "view gallery" on public.product_images;
create policy "view gallery" on public.product_images for select using (true);
drop policy if exists "admin gallery" on public.product_images;
create policy "admin gallery" on public.product_images for all using (public.is_admin()) with check (public.is_admin());

-- Email notifications: Postgres -> edge function `notify` (via pg_net). No-ops until configured.
create extension if not exists pg_net with schema extensions;
create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security; -- no policies: only service role / security-definer code can read
create or replace function public.send_notification(kind text, payload jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u text := (select value from app_config where key = 'notify_url'); s text := (select value from app_config where key = 'notify_secret');
begin
  if u is null or s is null then return; end if;
  perform net.http_post(url := u, body := jsonb_build_object('kind', kind) || payload, headers := jsonb_build_object('Content-Type','application/json','x-notify-secret', s));
exception when others then null; -- never block an order because email failed
end $$;
revoke all on function public.send_notification(text, jsonb) from public, anon, authenticated;
create or replace function public.trg_order_created() returns trigger language plpgsql as $$
begin perform public.send_notification('order_created', jsonb_build_object('order_id', new.id)); return new; end $$;
drop trigger if exists order_created_notify on public.orders;
create trigger order_created_notify after insert on public.orders for each row execute function public.trg_order_created();
create or replace function public.trg_order_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status and new.status in ('paid','shipped','delivered') then
    perform public.send_notification('order_' || new.status, jsonb_build_object('order_id', new.id)); end if;
  return new;
end $$;
drop trigger if exists order_status_notify on public.orders;
create trigger order_status_notify after update of status on public.orders for each row execute function public.trg_order_status();
create or replace function public.trg_low_stock() returns trigger language plpgsql as $$
begin
  if new.stock <= 10 and old.stock > 10 then perform public.send_notification('low_stock', jsonb_build_object('product_id', new.id)); end if;
  return new;
end $$;
drop trigger if exists low_stock_notify on public.products;
create trigger low_stock_notify after update of stock on public.products for each row execute function public.trg_low_stock();

-- Site-wide settings (e.g. the storefront theme). Everyone can read; only admins can change.
create table if not exists public.site_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.site_settings enable row level security;
drop policy if exists "read settings" on public.site_settings;
create policy "read settings" on public.site_settings for select using (true);
drop policy if exists "admin settings" on public.site_settings;
create policy "admin settings" on public.site_settings for all using (public.is_admin()) with check (public.is_admin());

-- Custom forms (built by admins)
create table if not exists public.forms (
  id bigint generated always as identity primary key, slug text unique not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  title text not null check (length(title) between 1 and 200), description text not null default '' check (length(description) <= 2000),
  success_message text not null default 'Thanks! We received your response.' check (length(success_message) <= 1000),
  fields jsonb not null default '[]' check (jsonb_typeof(fields) = 'array' and jsonb_array_length(fields) <= 40),
  active boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.form_submissions (
  id bigint generated always as identity primary key, form_id bigint not null references public.forms(id) on delete cascade,
  data jsonb not null, user_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now());
alter table public.forms enable row level security;
alter table public.form_submissions enable row level security;
drop policy if exists "view active forms" on public.forms;
create policy "view active forms" on public.forms for select using (active or public.is_admin());
drop policy if exists "admin forms" on public.forms;
create policy "admin forms" on public.forms for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin read responses" on public.form_submissions;
create policy "admin read responses" on public.form_submissions for select using (public.is_admin());
drop policy if exists "admin delete responses" on public.form_submissions;
create policy "admin delete responses" on public.form_submissions for delete using (public.is_admin());

-- Visitors submit through this function, which validates against the form definition.
create or replace function public.submit_form(form_slug text, answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare f public.forms; fld jsonb; v jsonb; txt text; k text; clean jsonb := '{}'; ftype text;
begin
  select * into f from forms where slug = form_slug and active;
  if not found then raise exception 'This form is not available'; end if;
  if (select count(*) from form_submissions where form_id = f.id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many submissions right now, please try again later'; end if;
  for fld in select * from jsonb_array_elements(f.fields) loop
    k := fld->>'id'; ftype := coalesce(fld->>'type', 'text'); v := answers->k;
    txt := case jsonb_typeof(v) when 'string' then v #>> '{}' when 'boolean' then v::text when 'number' then v::text else null end;
    if coalesce((fld->>'required')::boolean, false) and (txt is null or btrim(txt) = '' or txt = 'false') then
      raise exception '"%" is required', fld->>'label'; end if;
    if txt is null or btrim(txt) = '' then continue; end if;
    if length(txt) > 5000 then raise exception '"%" is too long', fld->>'label'; end if;
    if ftype = 'email' and txt !~ '^\S+@\S+\.\S+$' then raise exception '"%" must be a valid email', fld->>'label'; end if;
    if ftype = 'number' and txt !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception '"%" must be a number', fld->>'label'; end if;
    if ftype = 'select' and not (fld->'options') ? txt then raise exception '"%" has an invalid choice', fld->>'label'; end if;
    clean := clean || jsonb_build_object(k, case when ftype = 'checkbox' then to_jsonb(txt = 'true') else to_jsonb(txt) end);
  end loop;
  insert into form_submissions (form_id, data, user_id) values (f.id, clean, auth.uid());
end $$;
revoke all on function public.submit_form(text, jsonb) from public;
grant execute on function public.submit_form(text, jsonb) to anon, authenticated;

insert into public.forms (slug, title, description, success_message, fields) values (
  'contact', 'Contact us', 'Questions about a product or an order? Send us a message.', 'Thanks! We will get back to you soon.',
  '[{"id":"name","type":"text","label":"Your name","required":true},{"id":"email","type":"email","label":"Email","required":true},
    {"id":"topic","type":"select","label":"Topic","required":false,"options":["Product question","Order help","Delivery","Other"]},
    {"id":"message","type":"textarea","label":"Message","required":true}]') on conflict (slug) do nothing;

-- File uploads on forms: private bucket. Visitors can upload only into the folder of an active form; only admins can read/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('form-uploads', 'form-uploads', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;
drop policy if exists "upload form files" on storage.objects;
create policy "upload form files" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'form-uploads' and (storage.foldername(name))[1] in (select slug from public.forms where active));
drop policy if exists "admin read form files" on storage.objects;
create policy "admin read form files" on storage.objects for select using (bucket_id = 'form-uploads' and public.is_admin());
drop policy if exists "admin delete form files" on storage.objects;
create policy "admin delete form files" on storage.objects for delete using (bucket_id = 'form-uploads' and public.is_admin());

create or replace function public.submit_form(form_slug text, answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare f public.forms; fld jsonb; v jsonb; txt text; k text; clean jsonb := '{}'; ftype text;
begin
  select * into f from forms where slug = form_slug and active;
  if not found then raise exception 'This form is not available'; end if;
  if (select count(*) from form_submissions where form_id = f.id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many submissions right now, please try again later'; end if;
  for fld in select * from jsonb_array_elements(f.fields) loop
    k := fld->>'id'; ftype := coalesce(fld->>'type', 'text'); v := answers->k;
    txt := case jsonb_typeof(v) when 'string' then v #>> '{}' when 'boolean' then v::text when 'number' then v::text else null end;
    if coalesce((fld->>'required')::boolean, false) and (txt is null or btrim(txt) = '' or txt = 'false') then
      raise exception '"%" is required', fld->>'label'; end if;
    if txt is null or btrim(txt) = '' then continue; end if;
    if length(txt) > 5000 then raise exception '"%" is too long', fld->>'label'; end if;
    if ftype = 'email' and txt !~ '^\S+@\S+\.\S+$' then raise exception '"%" must be a valid email', fld->>'label'; end if;
    if ftype = 'number' and txt !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception '"%" must be a number', fld->>'label'; end if;
    if ftype = 'select' and not (fld->'options') ? txt then raise exception '"%" has an invalid choice', fld->>'label'; end if;
    if ftype = 'file' and (txt not like f.slug || '/%' or not exists (select 1 from storage.objects where bucket_id = 'form-uploads' and name = txt)) then
      raise exception '"%" upload was not found, please try again', fld->>'label'; end if;
    clean := clean || jsonb_build_object(k, case when ftype = 'checkbox' then to_jsonb(txt = 'true') else to_jsonb(txt) end);
  end loop;
  insert into form_submissions (form_id, data, user_id) values (f.id, clean, auth.uid());
end $$;
