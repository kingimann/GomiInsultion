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

-- Response tracking (status + notes) and "email me new responses"
alter table public.forms add column if not exists notify boolean not null default true;
alter table public.form_submissions add column if not exists status text not null default 'new' check (status in ('new','in_progress','done'));
alter table public.form_submissions add column if not exists notes text not null default '' check (length(notes) <= 5000);
drop policy if exists "admin update responses" on public.form_submissions;
create policy "admin update responses" on public.form_submissions for update using (public.is_admin()) with check (public.is_admin());
create or replace function public.trg_form_submitted() returns trigger language plpgsql as $$
begin
  if (select notify from public.forms where id = new.form_id) then
    perform public.send_notification('form_submitted', jsonb_build_object('submission_id', new.id)); end if;
  return new;
end $$;
drop trigger if exists form_submitted_notify on public.form_submissions;
create trigger form_submitted_notify after insert on public.form_submissions for each row execute function public.trg_form_submitted();

-- More form options: new field types (radio, multi, rating, url, time, display blocks), per-field limits,
-- and form-level settings (button label, close date, response cap, login required).
alter table public.forms add column if not exists submit_label text not null default 'Submit' check (length(submit_label) between 1 and 60);
alter table public.forms add column if not exists closes_at timestamptz;
alter table public.forms add column if not exists max_responses int check (max_responses is null or max_responses > 0);
alter table public.forms add column if not exists require_login boolean not null default false;

create or replace function public.form_status(form_slug text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare f public.forms; n int;
begin
  select * into f from forms where slug = form_slug and active;
  if not found then return jsonb_build_object('open', false, 'reason', 'missing'); end if;
  if f.closes_at is not null and f.closes_at <= now() then return jsonb_build_object('open', false, 'reason', 'closed'); end if;
  if f.max_responses is not null then
    select count(*) into n from form_submissions where form_id = f.id;
    if n >= f.max_responses then return jsonb_build_object('open', false, 'reason', 'full'); end if;
  end if;
  return jsonb_build_object('open', true, 'reason', '');
end $$;
grant execute on function public.form_status(text) to anon, authenticated;

create or replace function public.submit_form(form_slug text, answers jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare f public.forms; fld jsonb; v jsonb; txt text; k text; clean jsonb := '{}'; ftype text; item text; st jsonb; lim numeric;
begin
  select * into f from forms where slug = form_slug and active;
  if not found then raise exception 'This form is not available'; end if;
  st := public.form_status(form_slug);
  if not (st->>'open')::boolean then raise exception 'This form is no longer accepting responses'; end if;
  if f.require_login and auth.uid() is null then raise exception 'Please log in to submit this form'; end if;
  if (select count(*) from form_submissions where form_id = f.id and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many submissions right now, please try again later'; end if;
  for fld in select * from jsonb_array_elements(f.fields) loop
    k := fld->>'id'; ftype := coalesce(fld->>'type', 'text'); v := answers->k;
    if ftype in ('heading', 'paragraph', 'divider') then continue; end if;
    if ftype = 'multi' then
      if jsonb_typeof(v) = 'array' and jsonb_array_length(v) > 0 then
        if jsonb_array_length(v) > 50 then raise exception '"%" has too many choices', fld->>'label'; end if;
        for item in select jsonb_array_elements_text(v) loop
          if not (fld->'options') ? item then raise exception '"%" has an invalid choice', fld->>'label'; end if;
        end loop;
        clean := clean || jsonb_build_object(k, v);
      elsif coalesce((fld->>'required')::boolean, false) then raise exception '"%" is required', fld->>'label';
      end if;
      continue;
    end if;
    txt := case jsonb_typeof(v) when 'string' then v #>> '{}' when 'boolean' then v::text when 'number' then v::text else null end;
    if coalesce((fld->>'required')::boolean, false) and (txt is null or btrim(txt) = '' or txt = 'false') then
      raise exception '"%" is required', fld->>'label'; end if;
    if txt is null or btrim(txt) = '' then continue; end if;
    if length(txt) > coalesce(nullif(fld->>'maxlength', '')::int, 5000) then raise exception '"%" is too long', fld->>'label'; end if;
    if ftype = 'email' and txt !~ '^\S+@\S+\.\S+$' then raise exception '"%" must be a valid email', fld->>'label'; end if;
    if ftype = 'url' and txt !~* '^https?://\S+$' then raise exception '"%" must be a link starting with http:// or https://', fld->>'label'; end if;
    if ftype = 'time' and txt !~ '^[0-9]{2}:[0-9]{2}$' then raise exception '"%" must be a time', fld->>'label'; end if;
    if ftype = 'date' and txt !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '"%" must be a date', fld->>'label'; end if;
    if ftype = 'rating' and txt !~ '^[1-5]$' then raise exception '"%" must be between 1 and 5', fld->>'label'; end if;
    if ftype = 'number' then
      if txt !~ '^-?[0-9]+(\.[0-9]+)?$' then raise exception '"%" must be a number', fld->>'label'; end if;
      lim := nullif(fld->>'min', '')::numeric; if lim is not null and txt::numeric < lim then raise exception '"%" must be at least %', fld->>'label', lim; end if;
      lim := nullif(fld->>'max', '')::numeric; if lim is not null and txt::numeric > lim then raise exception '"%" must be at most %', fld->>'label', lim; end if;
    end if;
    if ftype in ('select', 'radio') and not (fld->'options') ? txt then raise exception '"%" has an invalid choice', fld->>'label'; end if;
    if ftype = 'file' and (txt not like f.slug || '/%' or not exists (select 1 from storage.objects where bucket_id = 'form-uploads' and name = txt)) then
      raise exception '"%" upload was not found, please try again', fld->>'label'; end if;
    clean := clean || jsonb_build_object(k, case when ftype = 'checkbox' then to_jsonb(txt = 'true') else to_jsonb(txt) end);
  end loop;
  insert into form_submissions (form_id, data, user_id) values (f.id, clean, auth.uid());
end $$;

-- ===== In-app notifications =====
create table if not exists public.notifications (
  id bigint generated always as identity primary key, user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, body text not null default '', link text not null default '',
  read boolean not null default false, created_at timestamptz not null default now());
create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);
alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
drop policy if exists "mark own read" on public.notifications;
create policy "mark own read" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications" on public.notifications for delete using (user_id = auth.uid());
-- (no insert policy: only the trigger helpers below create notifications)

create or replace function public.notify_user(uid uuid, k text, t text, b text, l text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link) select uid, k, left(t, 200), left(b, 300), l where uid is not null $$;
create or replace function public.notify_admins(k text, t text, b text, l text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link) select id, k, left(t, 200), left(b, 300), l from profiles where is_admin $$;
revoke all on function public.notify_user(uuid, text, text, text, text), public.notify_admins(text, text, text, text) from public, anon, authenticated;

create or replace function public.trg_n_order() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform notify_admins('order', 'New order #' || new.id, new.name || ' · $' || to_char(new.total_cents / 100.0, 'FM999990.00'), '#/admin/orders/' || new.id);
    perform notify_user(new.user_id, 'order', 'Order #' || new.id || ' received', 'Total $' || to_char(new.total_cents / 100.0, 'FM999990.00'), '#/order/' || new.id);
  elsif new.status is distinct from old.status then
    perform notify_user(new.user_id, 'order', 'Order #' || new.id || ' is now ' || new.status, '', '#/order/' || new.id);
  end if;
  return new;
end $$;
drop trigger if exists n_order_ins on public.orders;
create trigger n_order_ins after insert on public.orders for each row execute function public.trg_n_order();
drop trigger if exists n_order_upd on public.orders;
create trigger n_order_upd after update of status on public.orders for each row execute function public.trg_n_order();

create or replace function public.trg_n_stock() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stock <= 10 and old.stock > 10 then perform notify_admins('stock', 'Low stock: ' || new.name, new.stock || ' left', '#/admin/products/' || new.id); end if;
  return new;
end $$;
drop trigger if exists n_stock on public.products;
create trigger n_stock after update of stock on public.products for each row execute function public.trg_n_stock();

create or replace function public.trg_n_form() returns trigger language plpgsql security definer set search_path = public as $$
declare t text; n boolean;
begin
  select title, notify into t, n from forms where id = new.form_id;
  if n then perform notify_admins('form', 'New response: ' || t, '', '#/admin/forms/' || new.form_id || '/responses'); end if;
  return new;
end $$;
drop trigger if exists n_form on public.form_submissions;
create trigger n_form after insert on public.form_submissions for each row execute function public.trg_n_form();

create or replace function public.trg_n_quote() returns trigger language plpgsql security definer set search_path = public as $$
begin perform notify_admins('quote', 'New quote request', new.name || ': ' || left(new.message, 120), '#/admin/quotes'); return new; end $$;
drop trigger if exists n_quote on public.quotes;
create trigger n_quote after insert on public.quotes for each row execute function public.trg_n_quote();

-- ===== Private messaging (customer <-> store team) =====
create table if not exists public.conversations (
  id bigint generated always as identity primary key, customer_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id), subject text not null check (length(subject) between 1 and 200),
  closed boolean not null default false, created_at timestamptz not null default now(), last_message_at timestamptz not null default now());
create table if not exists public.messages (
  id bigint generated always as identity primary key, conversation_id bigint not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id), body text not null check (length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now());
create index if not exists messages_conv_idx on public.messages (conversation_id, id);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
drop policy if exists "view conversations" on public.conversations;
create policy "view conversations" on public.conversations for select using (customer_id = auth.uid() or public.is_admin());
drop policy if exists "start conversation" on public.conversations;
create policy "start conversation" on public.conversations for insert with check (created_by = auth.uid() and (customer_id = auth.uid() or public.is_admin()));
drop policy if exists "admin manage conversations" on public.conversations;
create policy "admin manage conversations" on public.conversations for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete conversations" on public.conversations;
create policy "admin delete conversations" on public.conversations for delete using (public.is_admin());
drop policy if exists "view messages" on public.messages;
create policy "view messages" on public.messages for select using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.customer_id = auth.uid() or public.is_admin())));
drop policy if exists "send message" on public.messages;
create policy "send message" on public.messages for insert with check (sender_id = auth.uid() and exists (
  select 1 from public.conversations c where c.id = conversation_id and (public.is_admin() or (c.customer_id = auth.uid() and not c.closed))));

create or replace function public.trg_msg_before() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 hour') >= 40 then
    raise exception 'You are sending messages too quickly, please wait a bit'; end if;
  return new;
end $$;
drop trigger if exists msg_before on public.messages;
create trigger msg_before before insert on public.messages for each row execute function public.trg_msg_before();
create or replace function public.trg_msg_after() returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversations; who text;
begin
  select * into c from conversations where id = new.conversation_id;
  update conversations set last_message_at = new.created_at where id = c.id;
  if new.sender_id = c.customer_id then
    select coalesce(nullif(name, ''), email) into who from profiles where id = c.customer_id;
    perform notify_admins('message', 'New message from ' || coalesce(who, 'a customer'), c.subject || ': ' || left(new.body, 120), '#/messages/' || c.id);
  else
    perform notify_user(c.customer_id, 'message', 'New reply from the store team', c.subject || ': ' || left(new.body, 120), '#/messages/' || c.id);
  end if;
  perform public.send_notification('new_message', jsonb_build_object('message_id', new.id));
  return new;
end $$;
drop trigger if exists msg_after on public.messages;
create trigger msg_after after insert on public.messages for each row execute function public.trg_msg_after();

-- Realtime: push new notifications and messages to open browsers (row-level security still applies)
do $$ begin alter publication supabase_realtime add table public.notifications; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;

-- DM-style chat: read receipts
alter table public.messages add column if not exists read_at timestamptz;
create or replace function public.mark_conversation_read(cid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare c public.conversations;
begin
  select * into c from conversations where id = cid;
  if not found then return; end if;
  if public.is_admin() then
    update messages set read_at = now() where conversation_id = cid and read_at is null and sender_id = c.customer_id;
  elsif c.customer_id = auth.uid() then
    update messages set read_at = now() where conversation_id = cid and read_at is null and sender_id <> c.customer_id;
  end if;
end $$;
revoke all on function public.mark_conversation_read(bigint) from public, anon;
grant execute on function public.mark_conversation_read(bigint) to authenticated;

-- ===== Custom pages (admin-editable content pages) =====
create table if not exists public.pages (
  id bigint generated always as identity primary key, slug text unique not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  title text not null check (length(title) between 1 and 200), body text not null default '' check (length(body) <= 100000),
  published boolean not null default false, show_in_nav boolean not null default false, show_in_footer boolean not null default true,
  sort int not null default 0, updated_at timestamptz not null default now(), created_at timestamptz not null default now());
alter table public.pages enable row level security;
drop policy if exists "view pages" on public.pages;
create policy "view pages" on public.pages for select using (published or public.is_admin());
drop policy if exists "admin pages" on public.pages;
create policy "admin pages" on public.pages for all using (public.is_admin()) with check (public.is_admin());
insert into public.pages (slug, title, body, published, show_in_footer, sort) values
 ('about', 'About us', E'# About us\n\nWe supply **quality insulation** to homeowners and contractors. Batts, spray foam, rigid board and everything you need to seal and insulate a build.\n\n## Why customers choose us\n\n- Honest advice on the right R-value for your project\n- Fast delivery or easy pickup\n- Trade and bulk pricing on request\n\n{{button: Request a quote | #/quote}}', true, true, 1),
 ('shipping-returns', 'Shipping & returns', E'# Shipping & returns\n\n## Delivery\n\nOrders over **$500** ship free. Smaller orders have a flat delivery fee shown at checkout.\n\n## Pickup\n\nChoose a pickup location at checkout and we will message you when your order is ready.\n\n## Returns\n\nUnopened products can be returned within 30 days. Contact us and we will sort it out.\n\n[Contact us](#/form/contact)', true, true, 2)
on conflict (slug) do nothing;

-- ===== Locations, per-location inventory, in-store sales =====
create table if not exists public.locations (
  id bigint generated always as identity primary key, name text not null check (length(name) between 1 and 100),
  kind text not null default 'warehouse' check (kind in ('warehouse','store','showroom','other')),
  address text not null default '', city text not null default '', postcode text not null default '', phone text not null default '',
  email text not null default '', hours text not null default '', active boolean not null default true,
  is_default boolean not null default false, pickup_enabled boolean not null default false, created_at timestamptz not null default now());
create unique index if not exists one_default_location on public.locations ((true)) where is_default;
create table if not exists public.inventory (
  product_id bigint not null references public.products(id) on delete cascade, location_id bigint not null references public.locations(id) on delete cascade,
  qty int not null default 0 check (qty >= 0), primary key (product_id, location_id));
create table if not exists public.inventory_log (
  id bigint generated always as identity primary key, product_id bigint references public.products(id) on delete cascade,
  location_id bigint references public.locations(id) on delete set null, delta int not null, qty_after int not null,
  kind text not null, note text not null default '', order_id bigint, user_id uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists inventory_log_idx on public.inventory_log (created_at desc);
create table if not exists public.order_item_allocations (
  order_item_id bigint not null references public.order_items(id) on delete cascade, location_id bigint not null references public.locations(id) on delete cascade,
  qty int not null check (qty > 0));
alter table public.orders add column if not exists location_id bigint references public.locations(id) on delete set null;
alter table public.orders add column if not exists fulfillment text not null default 'delivery' check (fulfillment in ('delivery','pickup'));
alter table public.orders add column if not exists source text not null default 'online' check (source in ('online','in_store'));
alter table public.orders add column if not exists payment_method text not null default '';

alter table public.locations enable row level security; alter table public.inventory enable row level security;
alter table public.inventory_log enable row level security; alter table public.order_item_allocations enable row level security;
drop policy if exists "view locations" on public.locations;
create policy "view locations" on public.locations for select using ((active and pickup_enabled) or public.is_admin());
drop policy if exists "admin locations" on public.locations;
create policy "admin locations" on public.locations for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin inventory" on public.inventory;
create policy "admin inventory" on public.inventory for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin inventory log" on public.inventory_log;
create policy "admin inventory log" on public.inventory_log for select using (public.is_admin());
drop policy if exists "admin allocations" on public.order_item_allocations;
create policy "admin allocations" on public.order_item_allocations for select using (public.is_admin());

-- first run: create the main location and move the existing stock into it
insert into public.locations (name, kind, is_default, active) select 'Main warehouse', 'warehouse', true, true where not exists (select 1 from public.locations);
insert into public.inventory (product_id, location_id, qty)
  select p.id, (select id from public.locations where is_default), p.stock from public.products p
  where not exists (select 1 from public.inventory i where i.product_id = p.id);

-- products.stock always equals the total across locations
create or replace function public.sync_product_stock() returns trigger language plpgsql security definer set search_path = public as $$
declare pid bigint := coalesce(new.product_id, old.product_id);
begin
  update products set stock = coalesce((select sum(qty) from inventory where product_id = pid), 0) where id = pid;
  return null;
end $$;
drop trigger if exists inventory_sync on public.inventory;
create trigger inventory_sync after insert or update or delete on public.inventory for each row execute function public.sync_product_stock();

create or replace function public.set_default_location(lid bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  update locations set is_default = false where is_default;
  update locations set is_default = true, active = true where id = lid;
end $$;

create or replace function public.set_inventory(pid bigint, lid bigint, new_qty int, note text default 'Manual adjustment') returns void
language plpgsql security definer set search_path = public as $$
declare old_qty int;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if new_qty < 0 then raise exception 'Quantity cannot be negative'; end if;
  select qty into old_qty from inventory where product_id = pid and location_id = lid for update;
  insert into inventory (product_id, location_id, qty) values (pid, lid, new_qty)
    on conflict (product_id, location_id) do update set qty = excluded.qty;
  if new_qty <> coalesce(old_qty, 0) then
    insert into inventory_log (product_id, location_id, delta, qty_after, kind, note) values (pid, lid, new_qty - coalesce(old_qty, 0), new_qty, 'adjust', left(coalesce(note, ''), 300));
  end if;
end $$;

create or replace function public.transfer_inventory(pid bigint, from_loc bigint, to_loc bigint, amount int, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare have int; a int; b int;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if from_loc = to_loc then raise exception 'Choose two different locations'; end if;
  if amount < 1 then raise exception 'Amount must be at least 1'; end if;
  select qty into have from inventory where product_id = pid and location_id = from_loc for update;
  if coalesce(have, 0) < amount then raise exception 'Only % in stock at the source location', coalesce(have, 0); end if;
  update inventory set qty = qty - amount where product_id = pid and location_id = from_loc returning qty into a;
  insert into inventory (product_id, location_id, qty) values (pid, to_loc, amount) on conflict (product_id, location_id) do update set qty = inventory.qty + amount returning qty into b;
  insert into inventory_log (product_id, location_id, delta, qty_after, kind, note) values (pid, from_loc, -amount, a, 'transfer_out', left(note, 300)), (pid, to_loc, amount, b, 'transfer_in', left(note, 300));
end $$;

-- take stock for an order item; strict = only from the given location
create or replace function public.allocate_stock(item_id bigint, pid bigint, need int, pref bigint, strict boolean, oid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare r record; take int; left_to int := need;
begin
  for r in select i.location_id, i.qty from inventory i join locations l on l.id = i.location_id
           where i.product_id = pid and i.qty > 0 and (l.active or l.id = pref) and (not strict or i.location_id = pref)
           order by (i.location_id = pref) desc, l.is_default desc, i.location_id for update of i loop
    exit when left_to <= 0;
    take := least(r.qty, left_to);
    update inventory set qty = qty - take where product_id = pid and location_id = r.location_id;
    insert into order_item_allocations (order_item_id, location_id, qty) values (item_id, r.location_id, take);
    insert into inventory_log (product_id, location_id, delta, qty_after, kind, order_id) values (pid, r.location_id, -take, r.qty - take, 'sale', oid);
    left_to := left_to - take;
  end loop;
  if left_to > 0 then raise exception 'Not enough stock'; end if;
end $$;
create or replace function public.restock_order(oid bigint) returns void language plpgsql security definer set search_path = public as $$
declare a record; n int;
begin
  for a in select al.location_id, al.qty, oi.product_id from order_item_allocations al join order_items oi on oi.id = al.order_item_id where oi.order_id = oid loop
    insert into inventory (product_id, location_id, qty) values (a.product_id, a.location_id, a.qty)
      on conflict (product_id, location_id) do update set qty = inventory.qty + a.qty returning qty into n;
    insert into inventory_log (product_id, location_id, delta, qty_after, kind, order_id, note) values (a.product_id, a.location_id, a.qty, n, 'restock', oid, 'Order cancelled');
  end loop;
end $$;
create or replace function public.unstock_order(oid bigint) returns void language plpgsql security definer set search_path = public as $$
declare a record; n int;
begin
  for a in select al.location_id, al.qty, oi.product_id from order_item_allocations al join order_items oi on oi.id = al.order_item_id where oi.order_id = oid loop
    update inventory set qty = greatest(0, qty - a.qty) where product_id = a.product_id and location_id = a.location_id returning qty into n;
    insert into inventory_log (product_id, location_id, delta, qty_after, kind, order_id, note) values (a.product_id, a.location_id, -a.qty, coalesce(n, 0), 'sale', oid, 'Order reinstated');
  end loop;
end $$;
revoke all on function public.allocate_stock(bigint, bigint, int, bigint, boolean, bigint), public.restock_order(bigint), public.unstock_order(bigint), public.sync_product_stock() from public, anon, authenticated;

create or replace function public.set_order_status(oid bigint, new_status text) returns void language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select status into old from orders where id = oid for update;
  if old is null then raise exception 'No such order'; end if;
  if new_status = 'cancelled' and old <> 'cancelled' then perform public.restock_order(oid);
  elsif old = 'cancelled' and new_status <> 'cancelled' then perform public.unstock_order(oid); end if;
  update orders set status = new_status where id = oid;
end $$;
create or replace function public.cancel_unpaid_order(oid bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from orders where id = oid and status = 'pending' for update;
  if not found then return; end if;
  perform public.restock_order(oid);
  update orders set status = 'cancelled' where id = oid;
end $$;
revoke all on function public.cancel_unpaid_order(bigint) from public, anon, authenticated;
grant execute on function public.cancel_unpaid_order(bigint) to service_role;

-- Which pickup locations can supply this cart right now?
create or replace function public.pickup_locations(items jsonb) returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'address', l.address, 'city', l.city, 'phone', l.phone, 'hours', l.hours,
    'available', not exists (select 1 from jsonb_array_elements(items) it where coalesce((select qty from inventory i where i.product_id = (it->>'id')::bigint and i.location_id = l.id), 0) < (it->>'qty')::int)) order by l.name), '[]')
  from locations l where l.active and l.pickup_enabled $$;
grant execute on function public.pickup_locations(jsonb) to anon, authenticated;

create or replace function public.place_order(items jsonb, customer jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := 50000; flat int := 1500;
  pickup boolean := coalesce(customer->>'fulfillment', 'delivery') = 'pickup'; loc public.locations; pref bigint;
  addr text; city text; pc text; avail int;
begin
  if jsonb_array_length(items) = 0 then raise exception 'Cart is empty'; end if;
  if pickup then
    select * into loc from locations where id = nullif(customer->>'location_id', '')::bigint and active and pickup_enabled;
    if not found then raise exception 'Please choose a pickup location'; end if;
    pref := loc.id;
    addr := 'Pickup: ' || loc.name || case when loc.address <> '' then ', ' || loc.address else '' end; city := coalesce(nullif(loc.city, ''), '-'); pc := coalesce(nullif(loc.postcode, ''), '-');
  else
    pref := (select id from locations where is_default);
    addr := customer->>'address'; city := customer->>'city'; pc := customer->>'postcode';
    if coalesce(btrim(addr), '') = '' or coalesce(btrim(city), '') = '' or coalesce(btrim(pc), '') = '' then raise exception 'Please enter your delivery address'; end if;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint and active for update;
    if not found or q < 1 then raise exception 'Not enough stock for %', coalesce(p.name, 'an item'); end if;
    if pickup then select coalesce(qty, 0) into avail from inventory where product_id = p.id and location_id = loc.id;
    else select coalesce(sum(i.qty), 0) into avail from inventory i join locations l on l.id = i.location_id where i.product_id = p.id and l.active; end if;
    if coalesce(avail, 0) < q then raise exception 'Not enough stock for %', p.name; end if;
    sub := sub + p.price_cents * q;
  end loop;
  if code is not null then
    pct := public.check_code(code, sub);
    if pct is null then raise exception 'That discount code is not valid'; end if;
    disc := sub * pct / 100;
  end if;
  ship := case when pickup or sub - disc >= free_over then 0 else flat end;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship, disc, code, pref, case when pickup then 'pickup' else 'delivery' end, 'online')
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name, p.price_cents, q) returning id into item_id;
    perform public.allocate_stock(item_id, p.id, q, pref, pickup, oid);
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $$;
grant execute on function public.place_order(jsonb, jsonb) to anon, authenticated;

-- In-store / point-of-sale: admin records a sale taken at one location
create or replace function public.record_sale(loc_id bigint, items jsonb, customer jsonb, payment text) returns bigint
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; q int; sub int := 0; oid bigint; item_id bigint; loc public.locations;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into loc from locations where id = loc_id and active;
  if not found then raise exception 'Choose an active location'; end if;
  if jsonb_array_length(items) = 0 then raise exception 'Add at least one product'; end if;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, status, location_id, fulfillment, source, payment_method)
  values (null, coalesce(customer->>'email', ''), coalesce(nullif(customer->>'name', ''), 'Walk-in customer'), coalesce(customer->>'phone', ''), 'In store: ' || loc.name,
          coalesce(nullif(loc.city, ''), '-'), coalesce(nullif(loc.postcode, ''), '-'), coalesce(customer->>'notes', ''), 0, 0, 0, 'paid', loc.id, 'pickup', 'in_store', left(coalesce(payment, ''), 40))
  returning id into oid;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int; select * into p from products where id = (it->>'id')::bigint for update;
    if not found or q < 1 then raise exception 'Invalid item'; end if;
    insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name, p.price_cents, q) returning id into item_id;
    begin perform public.allocate_stock(item_id, p.id, q, loc.id, true, oid);
    exception when others then raise exception 'Not enough stock of % at %', p.name, loc.name; end;
    sub := sub + p.price_cents * q;
  end loop;
  update orders set subtotal_cents = sub, total_cents = sub where id = oid;
  return oid;
end $$;
revoke all on function public.set_default_location(bigint), public.set_inventory(bigint, bigint, int, text), public.transfer_inventory(bigint, bigint, bigint, int, text), public.record_sale(bigint, jsonb, jsonb, text) from public, anon;
grant execute on function public.set_default_location(bigint), public.set_inventory(bigint, bigint, int, text), public.transfer_inventory(bigint, bigint, bigint, int, text), public.record_sale(bigint, jsonb, jsonb, text) to authenticated;

-- ===== Competitor price comparison (prices are entered and dated by admins) =====
create table if not exists public.competitors (
  id bigint generated always as identity primary key, name text not null unique check (length(name) between 1 and 80),
  active boolean not null default true, sort int not null default 0);
create table if not exists public.competitor_prices (
  product_id bigint not null references public.products(id) on delete cascade, competitor_id bigint not null references public.competitors(id) on delete cascade,
  price_cents int not null check (price_cents >= 0), url text not null default '' check (url = '' or url ~* '^https://'), note text not null default '' check (length(note) <= 200),
  in_stock boolean not null default true, checked_at timestamptz not null default now(), primary key (product_id, competitor_id));
alter table public.competitors enable row level security; alter table public.competitor_prices enable row level security;
drop policy if exists "view competitors" on public.competitors;
create policy "view competitors" on public.competitors for select using (active or public.is_admin());
drop policy if exists "admin competitors" on public.competitors;
create policy "admin competitors" on public.competitors for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "view competitor prices" on public.competitor_prices;
create policy "view competitor prices" on public.competitor_prices for select using (exists (select 1 from public.competitors c where c.id = competitor_id and (c.active or public.is_admin())));
drop policy if exists "admin competitor prices" on public.competitor_prices;
create policy "admin competitor prices" on public.competitor_prices for all using (public.is_admin()) with check (public.is_admin());
insert into public.competitors (name, sort) values ('Home Depot', 1), ('Réno-Dépôt', 2), ('Home Hardware', 3) on conflict (name) do nothing;
