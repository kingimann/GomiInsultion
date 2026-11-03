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

-- ===== Shipment tracking + guest order lookup =====
alter table public.orders add column if not exists tracking_carrier text not null default '' check (length(tracking_carrier) <= 40);
alter table public.orders add column if not exists tracking_number text not null default '' check (length(tracking_number) <= 60);

create or replace function public.set_order_tracking(oid bigint, carrier text, number text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  update orders set tracking_carrier = left(btrim(coalesce(carrier, '')), 40), tracking_number = left(btrim(coalesce(number, '')), 60) where id = oid;
  if not found then raise exception 'No such order'; end if;
  perform notify_user((select user_id from orders where id = oid), 'order', 'Tracking added for order #' || oid, coalesce(nullif(btrim(carrier), ''), 'Carrier') || ' ' || coalesce(number, ''), '#/order/' || oid);
end $$;
revoke all on function public.set_order_tracking(bigint, text, text) from public, anon;
grant execute on function public.set_order_tracking(bigint, text, text) to authenticated;

-- Guests look an order up with its number AND the email it was placed with.
create or replace function public.track_order(oid bigint, mail text) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(o) - 'guest_key' - 'user_id' - 'phone' - 'notes' || jsonb_build_object('items',
    (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price_cents', i.price_cents, 'product_id', i.product_id)), '[]') from order_items i where i.order_id = o.id))
  from orders o where o.id = oid and lower(btrim(o.email)) = lower(btrim(mail)) and o.email <> '' $$;
grant execute on function public.track_order(bigint, text) to anon, authenticated;

-- ===== Business management: settings, costs/profit, refunds, notes, purchasing, team, audit =====
create or replace function public.store_cfg(k text, def numeric) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>k)::numeric from site_settings where key = 'store' and (value->>k) ~ '^-?[0-9]+(\.[0-9]+)?$'), def) $$;
create or replace function public.store_cfg_text(k text, def text) returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value->>k, '') from site_settings where key = 'store'), def) $$;

alter table public.orders add column if not exists tax_cents int not null default 0;
alter table public.orders add column if not exists tax_label text not null default '';
alter table public.orders add column if not exists refunded_cents int not null default 0;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('pending','paid','shipped','delivered','cancelled','refunded'));
alter table public.products add column if not exists cost_cents int not null default 0 check (cost_cents >= 0);
alter table public.products add column if not exists reorder_point int not null default 10 check (reorder_point >= 0);
alter table public.products add column if not exists reorder_qty int not null default 0 check (reorder_qty >= 0);
alter table public.order_items add column if not exists cost_cents int not null default 0;
create or replace function public.trg_item_cost() returns trigger language plpgsql security definer set search_path = public as $$
begin new.cost_cents := coalesce((select cost_cents from products where id = new.product_id), 0); return new; end $$;
drop trigger if exists item_cost on public.order_items;
create trigger item_cost before insert on public.order_items for each row execute function public.trg_item_cost();

-- audit log
create table if not exists public.audit_log (
  id bigint generated always as identity primary key, user_id uuid, actor text not null default 'system', action text not null, entity text not null,
  entity_id text not null default '', detail jsonb not null default '{}', created_at timestamptz not null default now());
create index if not exists audit_idx on public.audit_log (created_at desc);
alter table public.audit_log enable row level security;
drop policy if exists "admin read audit" on public.audit_log;
create policy "admin read audit" on public.audit_log for select using (public.is_admin());
create or replace function public.audit(act text, ent text, eid text, det jsonb default '{}') returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, actor, action, entity, entity_id, detail)
  values (auth.uid(), coalesce((select coalesce(nullif(name, ''), email) from profiles where id = auth.uid()), 'system'), act, ent, eid, det);
end $$;
revoke all on function public.audit(text, text, text, jsonb) from public, anon, authenticated;
create or replace function public.trg_audit_product() returns trigger language plpgsql security definer set search_path = public as $$
declare d jsonb := '{}';
begin
  if tg_op = 'INSERT' then perform audit('product.created', 'product', new.id::text, jsonb_build_object('name', new.name)); return new; end if;
  if tg_op = 'DELETE' then perform audit('product.deleted', 'product', old.id::text, jsonb_build_object('name', old.name)); return old; end if;
  if new.price_cents is distinct from old.price_cents then d := d || jsonb_build_object('price', jsonb_build_array(old.price_cents, new.price_cents)); end if;
  if new.cost_cents is distinct from old.cost_cents then d := d || jsonb_build_object('cost', jsonb_build_array(old.cost_cents, new.cost_cents)); end if;
  if new.active is distinct from old.active then d := d || jsonb_build_object('active', jsonb_build_array(old.active, new.active)); end if;
  if new.name is distinct from old.name then d := d || jsonb_build_object('name', jsonb_build_array(old.name, new.name)); end if;
  if d <> '{}' then perform audit('product.updated', 'product', new.id::text, d || jsonb_build_object('product', new.name)); end if;
  return new;
end $$;
drop trigger if exists audit_product on public.products;
create trigger audit_product after insert or update or delete on public.products for each row execute function public.trg_audit_product();
create or replace function public.trg_audit_order() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then perform audit('order.status', 'order', new.id::text, jsonb_build_object('from', old.status, 'to', new.status)); end if;
  return new;
end $$;
drop trigger if exists audit_order on public.orders;
create trigger audit_order after update of status on public.orders for each row execute function public.trg_audit_order();
create or replace function public.trg_audit_settings() returns trigger language plpgsql security definer set search_path = public as $$
begin perform audit('settings.changed', 'settings', new.key, '{}'); return new; end $$;
drop trigger if exists audit_settings on public.site_settings;
create trigger audit_settings after insert or update on public.site_settings for each row execute function public.trg_audit_settings();

-- team management
create or replace function public.set_admin(uid uuid, make boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  if not make and (select count(*) from profiles where is_admin and id <> uid) = 0 then raise exception 'There must be at least one admin'; end if;
  update profiles set is_admin = make where id = uid;
  if not found then raise exception 'No such user'; end if;
  perform audit(case when make then 'team.admin_added' else 'team.admin_removed' end, 'user', uid::text, jsonb_build_object('email', (select email from profiles where id = uid)));
end $$;
revoke all on function public.set_admin(uuid, boolean) from public, anon;
grant execute on function public.set_admin(uuid, boolean) to authenticated;

-- order notes (admin only) and refunds
create table if not exists public.order_notes (
  id bigint generated always as identity primary key, order_id bigint not null references public.orders(id) on delete cascade,
  note text not null check (length(btrim(note)) between 1 and 2000), author text not null default '', created_at timestamptz not null default now());
create table if not exists public.refunds (
  id bigint generated always as identity primary key, order_id bigint not null references public.orders(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0), reason text not null default '', author text not null default '', created_at timestamptz not null default now());
create table if not exists public.customer_info (
  user_id uuid primary key references auth.users(id) on delete cascade, notes text not null default '' check (length(notes) <= 5000),
  tags text[] not null default '{}', updated_at timestamptz not null default now());
alter table public.order_notes enable row level security; alter table public.refunds enable row level security; alter table public.customer_info enable row level security;
drop policy if exists "admin order notes" on public.order_notes; create policy "admin order notes" on public.order_notes for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin refunds read" on public.refunds; create policy "admin refunds read" on public.refunds for select using (public.is_admin());
drop policy if exists "admin customer info" on public.customer_info; create policy "admin customer info" on public.customer_info for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.refund_order(oid bigint, amount int, why text default '') returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; who text;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into o from orders where id = oid for update;
  if not found then raise exception 'No such order'; end if;
  if amount < 1 or amount > o.total_cents - o.refunded_cents then raise exception 'Refund must be between $0.01 and $%', to_char((o.total_cents - o.refunded_cents) / 100.0, 'FM999990.00'); end if;
  who := coalesce((select coalesce(nullif(name, ''), email) from profiles where id = auth.uid()), '');
  insert into refunds (order_id, amount_cents, reason, author) values (oid, amount, left(coalesce(why, ''), 300), who);
  update orders set refunded_cents = refunded_cents + amount where id = oid;
  perform audit('order.refund', 'order', oid::text, jsonb_build_object('amount_cents', amount, 'reason', why));
  perform notify_user(o.user_id, 'order', 'Refund issued for order #' || oid, '$' || to_char(amount / 100.0, 'FM999990.00') || ' has been refunded', '#/order/' || oid);
end $$;
revoke all on function public.refund_order(bigint, int, text) from public, anon; grant execute on function public.refund_order(bigint, int, text) to authenticated;

-- suppliers and purchase orders
create table if not exists public.suppliers (
  id bigint generated always as identity primary key, name text not null unique check (length(name) between 1 and 120), contact_name text not null default '',
  email text not null default '', phone text not null default '', notes text not null default '', active boolean not null default true);
create table if not exists public.purchase_orders (
  id bigint generated always as identity primary key, supplier_id bigint references public.suppliers(id) on delete set null, location_id bigint references public.locations(id) on delete set null,
  status text not null default 'draft' check (status in ('draft','ordered','received','cancelled')), expected_at date, notes text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), received_at timestamptz);
create table if not exists public.purchase_order_items (
  id bigint generated always as identity primary key, po_id bigint not null references public.purchase_orders(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade, qty int not null check (qty > 0), unit_cost_cents int not null default 0 check (unit_cost_cents >= 0));
alter table public.suppliers enable row level security; alter table public.purchase_orders enable row level security; alter table public.purchase_order_items enable row level security;
drop policy if exists "admin suppliers" on public.suppliers; create policy "admin suppliers" on public.suppliers for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin pos" on public.purchase_orders; create policy "admin pos" on public.purchase_orders for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin po items" on public.purchase_order_items; create policy "admin po items" on public.purchase_order_items for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.receive_purchase_order(poid bigint) returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders; it record; n int;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into po from purchase_orders where id = poid for update;
  if not found then raise exception 'No such purchase order'; end if;
  if po.status not in ('draft', 'ordered') then raise exception 'This purchase order is already %', po.status; end if;
  if po.location_id is null then raise exception 'Choose a delivery location first'; end if;
  for it in select * from purchase_order_items where po_id = poid loop
    insert into inventory (product_id, location_id, qty) values (it.product_id, po.location_id, it.qty)
      on conflict (product_id, location_id) do update set qty = inventory.qty + it.qty returning qty into n;
    insert into inventory_log (product_id, location_id, delta, qty_after, kind, note) values (it.product_id, po.location_id, it.qty, n, 'receive', 'Purchase order #' || poid);
    if it.unit_cost_cents > 0 then update products set cost_cents = it.unit_cost_cents where id = it.product_id; end if;
  end loop;
  update purchase_orders set status = 'received', received_at = now() where id = poid;
  perform audit('purchase.received', 'purchase_order', poid::text, '{}');
end $$;
revoke all on function public.receive_purchase_order(bigint) from public, anon; grant execute on function public.receive_purchase_order(bigint) to authenticated;

-- place_order / record_sale now use the shipping + tax settings
create or replace function public.place_order(items jsonb, customer jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := public.store_cfg('free_over_cents', 50000)::int; flat int := public.store_cfg('ship_flat_cents', 1500)::int;
  rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
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
  tax := round((sub - disc + ship) * rate / 100.0)::int;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source, tax_cents, tax_label)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship + tax, disc, code, pref,
          case when pickup then 'pickup' else 'delivery' end, 'online', tax, case when tax > 0 then tlabel else '' end)
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

create or replace function public.record_sale(loc_id bigint, items jsonb, customer jsonb, payment text) returns bigint
language plpgsql security definer set search_path = public as $$
declare it jsonb; p public.products; q int; sub int := 0; oid bigint; item_id bigint; loc public.locations; rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
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
  tax := round(sub * rate / 100.0)::int;
  update orders set subtotal_cents = sub, tax_cents = tax, tax_label = case when tax > 0 then tlabel else '' end, total_cents = sub + tax where id = oid;
  return oid;
end $$;

-- ===== Roles & permissions =====
alter table public.profiles add column if not exists role text not null default 'customer'
  check (role in ('customer','owner','admin','manager','staff','warehouse','accountant','support'));
update public.profiles set role = 'owner' where is_admin and role = 'customer';
create table if not exists public.role_permissions (role text not null, perm text not null, primary key (role, perm));
alter table public.role_permissions enable row level security;
insert into public.role_permissions (role, perm) values
 ('owner','*'), ('admin','*'),
 ('manager','orders.view'),('manager','orders.manage'),('manager','orders.refund'),('manager','catalog.manage'),('manager','inventory.view'),('manager','inventory.manage'),('manager','pos'),
 ('manager','reports.view'),('manager','customers.view'),('manager','customers.manage'),('manager','messages'),('manager','purchasing.view'),('manager','purchasing.manage'),('manager','content.manage'),
 ('staff','orders.view'),('staff','pos'),('staff','customers.view'),('staff','messages'),('staff','inventory.view'),
 ('warehouse','orders.view'),('warehouse','orders.manage'),('warehouse','inventory.view'),('warehouse','inventory.manage'),('warehouse','purchasing.view'),('warehouse','purchasing.manage'),
 ('accountant','invoices.view'),('accountant','invoices.manage'),('accountant','reports.view'),('accountant','orders.view'),('accountant','customers.view'),('accountant','purchasing.view'),
 ('support','messages'),('support','orders.view'),('support','customers.view')
on conflict do nothing;

create or replace function public.user_has_perm(uid uuid, p text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles pr join role_permissions rp on rp.role = pr.role where pr.id = uid and rp.perm in (p, '*')) $$;
create or replace function public.has_perm(p text) returns boolean language sql stable security definer set search_path = public as $$
  select public.user_has_perm(auth.uid(), p) $$;
create or replace function public.my_perms() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rp.perm), '[]') from role_permissions rp join profiles pr on pr.role = rp.role where pr.id = auth.uid() $$;
grant execute on function public.has_perm(text), public.my_perms() to anon, authenticated;
revoke all on function public.user_has_perm(uuid, text) from public, anon, authenticated;

-- keep profiles.is_admin (= owner or admin) in sync with the role
create or replace function public.trg_profile_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then new.is_admin := new.role in ('owner','admin');
  elsif new.is_admin is distinct from old.is_admin then
    new.role := case when new.is_admin then (case when exists (select 1 from profiles where role = 'owner' and id <> new.id) then 'admin' else 'owner' end) else 'customer' end;
  end if;
  return new;
end $$;
drop trigger if exists profile_role_sync on public.profiles;
create trigger profile_role_sync before update of role, is_admin on public.profiles for each row execute function public.trg_profile_role();

create or replace function public.set_role(uid uuid, new_role text) returns void language plpgsql security definer set search_path = public as $$
declare caller text := (select role from profiles where id = auth.uid()); cur text := (select role from profiles where id = uid);
begin
  if not public.has_perm('team.manage') then raise exception 'Not allowed'; end if;
  if cur is null then raise exception 'No such user'; end if;
  if new_role not in ('customer','owner','admin','manager','staff','warehouse','accountant','support') then raise exception 'Unknown role'; end if;
  if (new_role in ('owner','admin') or cur in ('owner','admin')) and caller <> 'owner' then raise exception 'Only an owner can change owners and admins'; end if;
  if cur in ('owner','admin') and new_role not in ('owner','admin') and (select count(*) from profiles where role in ('owner','admin') and id <> uid) = 0 then raise exception 'There must be at least one owner or admin'; end if;
  if cur = 'owner' and new_role <> 'owner' and (select count(*) from profiles where role = 'owner' and id <> uid) = 0 then raise exception 'There must be at least one owner'; end if;
  update profiles set role = new_role where id = uid;
  perform audit('team.role_changed', 'user', uid::text, jsonb_build_object('email', (select email from profiles where id = uid), 'from', cur, 'to', new_role));
end $$;
revoke all on function public.set_role(uuid, text) from public, anon; grant execute on function public.set_role(uuid, text) to authenticated;
create or replace function public.set_admin(uid uuid, make boolean) returns void language sql security definer set search_path = public as $$
  select public.set_role(uid, case when make then 'admin' else 'customer' end) $$;
revoke all on function public.set_admin(uuid, boolean) from public, anon; grant execute on function public.set_admin(uuid, boolean) to authenticated;

-- RPCs now check the specific permission instead of "admin"
do $$ declare r record; def text; begin
  for r in select * from (values ('set_order_status','orders.manage'),('set_order_tracking','orders.manage'),('refund_order','orders.refund'),('set_inventory','inventory.manage'),
      ('transfer_inventory','inventory.manage'),('record_sale','pos'),('receive_purchase_order','purchasing.manage'),('mark_conversation_read','messages')) as v(fn, perm) loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = r.fn;
    def := replace(def, 'public.is_admin()', format('public.has_perm(%L)', r.perm));
    execute def;
  end loop;
end $$;

-- who gets which notification
create or replace function public.notify_admins(k text, t text, b text, l text) returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link)
  select pr.id, k, left(t, 200), left(b, 300), l from profiles pr
  where pr.role <> 'customer' and public.user_has_perm(pr.id, case k when 'order' then 'orders.view' when 'stock' then 'inventory.view' when 'form' then 'content.manage'
        when 'quote' then 'customers.view' when 'message' then 'messages' when 'invoice' then 'invoices.view' else 'team.manage' end) $$;
revoke all on function public.notify_admins(text, text, text, text) from public, anon, authenticated;

-- extra policies for the limited roles (admins keep their existing "all" policies)
do $$ declare x record; begin
  for x in select * from (values
    ('profiles','staff view profiles','select','public.has_perm(''customers.view'')',null),
    ('orders','staff view orders','select','public.has_perm(''orders.view'')',null),
    ('order_items','staff view order items','select','public.has_perm(''orders.view'')',null),
    ('order_notes','staff order notes','all','public.has_perm(''orders.manage'')','public.has_perm(''orders.manage'')'),
    ('refunds','staff view refunds','select','public.has_perm(''orders.view'')',null),
    ('order_item_allocations','staff view allocations','select','public.has_perm(''orders.view'')',null),
    ('products','staff products','all','public.has_perm(''catalog.manage'')','public.has_perm(''catalog.manage'')'),
    ('product_images','staff product images','all','public.has_perm(''catalog.manage'')','public.has_perm(''catalog.manage'')'),
    ('competitors','staff competitors','all','public.has_perm(''catalog.manage'')','public.has_perm(''catalog.manage'')'),
    ('competitor_prices','staff competitor prices','all','public.has_perm(''catalog.manage'')','public.has_perm(''catalog.manage'')'),
    ('inventory','staff view inventory','select','public.has_perm(''inventory.view'')',null),
    ('inventory_log','staff view inventory log','select','public.has_perm(''inventory.view'')',null),
    ('locations','staff view locations','select','public.has_perm(''inventory.view'') or public.has_perm(''pos'')',null),
    ('quotes','staff view quotes','select','public.has_perm(''customers.view'')',null),
    ('customer_info','staff view customer info','select','public.has_perm(''customers.view'')',null),
    ('customer_info','staff manage customer info','all','public.has_perm(''customers.manage'')','public.has_perm(''customers.manage'')'),
    ('discount_codes','staff codes','all','public.has_perm(''content.manage'')','public.has_perm(''content.manage'')'),
    ('pages','staff pages','all','public.has_perm(''content.manage'')','public.has_perm(''content.manage'')'),
    ('forms','staff forms','all','public.has_perm(''content.manage'')','public.has_perm(''content.manage'')'),
    ('form_submissions','staff responses','all','public.has_perm(''content.manage'')','public.has_perm(''content.manage'')'),
    ('conversations','staff view conversations','select','public.has_perm(''messages'')',null),
    ('conversations','staff update conversations','update','public.has_perm(''messages'')','public.has_perm(''messages'')'),
    ('conversations','staff start conversations','insert',null,'created_by = auth.uid() and public.has_perm(''messages'')'),
    ('messages','staff view messages','select','public.has_perm(''messages'')',null),
    ('messages','staff send messages','insert',null,'sender_id = auth.uid() and public.has_perm(''messages'')'),
    ('suppliers','staff view suppliers','select','public.has_perm(''purchasing.view'')',null),
    ('suppliers','staff manage suppliers','all','public.has_perm(''purchasing.manage'')','public.has_perm(''purchasing.manage'')'),
    ('purchase_orders','staff view pos','select','public.has_perm(''purchasing.view'')',null),
    ('purchase_orders','staff manage pos','all','public.has_perm(''purchasing.manage'')','public.has_perm(''purchasing.manage'')'),
    ('purchase_order_items','staff view po items','select','public.has_perm(''purchasing.view'')',null),
    ('purchase_order_items','staff manage po items','all','public.has_perm(''purchasing.manage'')','public.has_perm(''purchasing.manage'')')
  ) as v(tbl, pol, cmd, using_expr, check_expr) loop
    execute format('drop policy if exists %I on public.%I', x.pol, x.tbl);
    execute format('create policy %I on public.%I for %s %s %s', x.pol, x.tbl, x.cmd,
      case when x.using_expr is not null then 'using (' || x.using_expr || ')' else '' end,
      case when x.check_expr is not null then 'with check (' || x.check_expr || ')' else '' end);
  end loop;
end $$;

-- ===== Invoicing (QuickBooks-style; owner/admin/accountant) =====
create sequence if not exists public.invoice_number_seq start 1001;
create table if not exists public.invoices (
  id bigint generated always as identity primary key, number text unique not null, view_key uuid not null default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null, customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_email text not null default '', customer_address text not null default '',
  issue_date date not null default current_date, due_date date not null default (current_date + 14),
  status text not null default 'draft' check (status in ('draft','sent','paid','void')),
  notes text not null default '' check (length(notes) <= 3000), terms text not null default '' check (length(terms) <= 3000),
  discount_cents int not null default 0 check (discount_cents >= 0), tax_rate numeric not null default 0, tax_label text not null default '',
  subtotal_cents int not null default 0, tax_cents int not null default 0, total_cents int not null default 0, paid_cents int not null default 0,
  sent_at timestamptz, created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.invoice_items (
  id bigint generated always as identity primary key, invoice_id bigint not null references public.invoices(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 500), qty numeric(12,3) not null default 1 check (qty > 0),
  unit_price_cents int not null default 0, taxable boolean not null default true, product_id bigint references public.products(id) on delete set null, sort int not null default 0);
create table if not exists public.invoice_payments (
  id bigint generated always as identity primary key, invoice_id bigint not null references public.invoices(id) on delete cascade,
  amount_cents int not null check (amount_cents > 0), method text not null default '', reference text not null default '', note text not null default '',
  paid_on date not null default current_date, created_by uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists invoices_status_idx on public.invoices (status, due_date);
alter table public.invoices enable row level security; alter table public.invoice_items enable row level security; alter table public.invoice_payments enable row level security;
drop policy if exists "view invoices" on public.invoices;
create policy "view invoices" on public.invoices for select using (public.has_perm('invoices.view') or (customer_id = auth.uid() and status <> 'draft'));
drop policy if exists "view invoice items" on public.invoice_items;
create policy "view invoice items" on public.invoice_items for select using (exists (select 1 from public.invoices i where i.id = invoice_id and (public.has_perm('invoices.view') or (i.customer_id = auth.uid() and i.status <> 'draft'))));
drop policy if exists "view invoice payments" on public.invoice_payments;
create policy "view invoice payments" on public.invoice_payments for select using (exists (select 1 from public.invoices i where i.id = invoice_id and (public.has_perm('invoices.view') or (i.customer_id = auth.uid() and i.status <> 'draft'))));
-- (no write policies: everything goes through the functions below)

create or replace function public.save_invoice(inv jsonb, items jsonb) returns bigint language plpgsql security definer set search_path = public as $$
declare iid bigint := nullif(inv->>'id', '')::bigint; it jsonb; amt int; sub int := 0; tsub int := 0; disc int; taxable int; rate numeric; lbl text; tax int; tot int; cur record; n int := 0;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'Add at least one line item'; end if;
  for it in select * from jsonb_array_elements(items) loop
    amt := round((it->>'qty')::numeric * (it->>'unit_price_cents')::numeric)::int; sub := sub + amt;
    if coalesce((it->>'taxable')::boolean, true) then tsub := tsub + amt; end if;
  end loop;
  disc := least(greatest(coalesce(nullif(inv->>'discount_cents', '')::int, 0), 0), sub);
  taxable := case when sub > 0 then tsub - round(disc * tsub::numeric / sub)::int else 0 end;
  rate := coalesce(nullif(inv->>'tax_rate', '')::numeric, public.store_cfg('tax_rate', 0)); lbl := coalesce(nullif(inv->>'tax_label', ''), public.store_cfg_text('tax_label', 'Tax'));
  tax := round(taxable * rate / 100.0)::int; tot := sub - disc + tax;
  if iid is null then
    insert into invoices (number, customer_id, customer_name, customer_email, customer_address, issue_date, due_date, notes, terms, discount_cents, tax_rate, tax_label, subtotal_cents, tax_cents, total_cents)
    values (public.store_cfg_text('invoice_prefix', 'INV') || '-' || nextval('public.invoice_number_seq'), nullif(inv->>'customer_id', '')::uuid, btrim(inv->>'customer_name'), coalesce(inv->>'customer_email', ''), coalesce(inv->>'customer_address', ''),
      coalesce(nullif(inv->>'issue_date', '')::date, current_date), coalesce(nullif(inv->>'due_date', '')::date, current_date + 14), coalesce(inv->>'notes', ''), coalesce(inv->>'terms', ''), disc, rate, lbl, sub, tax, tot)
    returning id into iid;
    perform audit('invoice.created', 'invoice', iid::text, '{}');
  else
    select * into cur from invoices where id = iid for update;
    if not found then raise exception 'No such invoice'; end if;
    if cur.status in ('paid', 'void') then raise exception 'This invoice is % and can no longer be edited', cur.status; end if;
    if tot < cur.paid_cents then raise exception 'Total cannot be lower than the % already paid', to_char(cur.paid_cents / 100.0, 'FM999990.00'); end if;
    update invoices set customer_id = nullif(inv->>'customer_id', '')::uuid, customer_name = btrim(inv->>'customer_name'), customer_email = coalesce(inv->>'customer_email', ''), customer_address = coalesce(inv->>'customer_address', ''),
      issue_date = coalesce(nullif(inv->>'issue_date', '')::date, issue_date), due_date = coalesce(nullif(inv->>'due_date', '')::date, due_date), notes = coalesce(inv->>'notes', ''), terms = coalesce(inv->>'terms', ''),
      discount_cents = disc, tax_rate = rate, tax_label = lbl, subtotal_cents = sub, tax_cents = tax, total_cents = tot, updated_at = now() where id = iid;
    delete from invoice_items where invoice_id = iid;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    n := n + 1;
    insert into invoice_items (invoice_id, description, qty, unit_price_cents, taxable, product_id, sort)
    values (iid, btrim(it->>'description'), (it->>'qty')::numeric, (it->>'unit_price_cents')::int, coalesce((it->>'taxable')::boolean, true), nullif(it->>'product_id', '')::bigint, n);
  end loop;
  return iid;
end $$;

create or replace function public.record_invoice_payment(iid bigint, amount int, pay_method text default '', ref text default '', paid date default current_date, memo text default '') returns void
language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into inv from invoices where id = iid for update;
  if not found then raise exception 'No such invoice'; end if;
  if inv.status = 'void' then raise exception 'This invoice is void'; end if;
  if amount < 1 or amount > inv.total_cents - inv.paid_cents then raise exception 'Payment must be between $0.01 and $%', to_char((inv.total_cents - inv.paid_cents) / 100.0, 'FM999990.00'); end if;
  insert into invoice_payments (invoice_id, amount_cents, method, reference, paid_on, note) values (iid, amount, left(coalesce(pay_method, ''), 40), left(coalesce(ref, ''), 80), coalesce(paid, current_date), left(coalesce(memo, ''), 300));
  update invoices set paid_cents = paid_cents + amount, status = case when paid_cents + amount >= total_cents then 'paid' when status = 'draft' then 'sent' else status end,
    sent_at = coalesce(sent_at, now()), updated_at = now() where id = iid;
  perform audit('invoice.payment', 'invoice', iid::text, jsonb_build_object('amount_cents', amount, 'method', pay_method));
  perform notify_admins('invoice', 'Payment on ' || inv.number, '$' || to_char(amount / 100.0, 'FM999990.00') || ' from ' || inv.customer_name, '#/admin/invoices/' || iid);
end $$;

create or replace function public.delete_invoice_payment(pid bigint) returns void language plpgsql security definer set search_path = public as $$
declare p public.invoice_payments;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into p from invoice_payments where id = pid; if not found then raise exception 'No such payment'; end if;
  delete from invoice_payments where id = pid;
  update invoices set paid_cents = greatest(0, paid_cents - p.amount_cents), status = case when status = 'paid' then 'sent' else status end, updated_at = now() where id = p.invoice_id;
  perform audit('invoice.payment_deleted', 'invoice', p.invoice_id::text, jsonb_build_object('amount_cents', p.amount_cents));
end $$;

create or replace function public.set_invoice_status(iid bigint, new_status text) returns void language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into inv from invoices where id = iid for update; if not found then raise exception 'No such invoice'; end if;
  if new_status = 'sent' then
    if inv.status = 'void' then raise exception 'Reopen the invoice first'; end if;
    update invoices set status = case when paid_cents >= total_cents and total_cents > 0 then 'paid' else 'sent' end, sent_at = coalesce(sent_at, now()), updated_at = now() where id = iid;
    perform notify_user(inv.customer_id, 'invoice', 'Invoice ' || inv.number || ' from the store', 'Total $' || to_char(inv.total_cents / 100.0, 'FM999990.00') || ', due ' || inv.due_date, '#/invoice/' || iid);
    perform public.send_notification('invoice_sent', jsonb_build_object('invoice_id', iid));
  elsif new_status = 'void' then
    if inv.paid_cents > 0 then raise exception 'Remove the recorded payments before voiding'; end if;
    update invoices set status = 'void', updated_at = now() where id = iid;
  elsif new_status = 'draft' then
    if inv.paid_cents > 0 then raise exception 'This invoice has payments and cannot go back to draft'; end if;
    update invoices set status = 'draft', updated_at = now() where id = iid;
  else raise exception 'Unknown status'; end if;
  perform audit('invoice.' || new_status, 'invoice', iid::text, '{}');
end $$;

create or replace function public.delete_invoice(iid bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  if (select status from invoices where id = iid) not in ('draft', 'void') then raise exception 'Only draft or void invoices can be deleted'; end if;
  delete from invoices where id = iid; perform audit('invoice.deleted', 'invoice', iid::text, '{}');
end $$;

-- customers (or guests with the private link) can view a sent invoice
create or replace function public.get_invoice_public(iid bigint, k uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(i) - 'view_key' - 'created_by' || jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from invoice_items x where x.invoice_id = i.id),
    'payments', (select coalesce(jsonb_agg(jsonb_build_object('amount_cents', p.amount_cents, 'method', p.method, 'paid_on', p.paid_on) order by p.id), '[]') from invoice_payments p where p.invoice_id = i.id))
  from invoices i where i.id = iid and i.view_key = k and i.status <> 'draft' $$;
grant execute on function public.get_invoice_public(bigint, uuid) to anon, authenticated;
revoke all on function public.save_invoice(jsonb, jsonb), public.record_invoice_payment(bigint, int, text, text, date, text), public.delete_invoice_payment(bigint), public.set_invoice_status(bigint, text), public.delete_invoice(bigint) from public, anon;
grant execute on function public.save_invoice(jsonb, jsonb), public.record_invoice_payment(bigint, int, text, text, date, text), public.delete_invoice_payment(bigint), public.set_invoice_status(bigint, text), public.delete_invoice(bigint) to authenticated;

-- ===== Estimates, recurring invoices, online invoice payments =====
create or replace function public.doc_totals(items jsonb, disc_in int, rate numeric) returns jsonb language plpgsql immutable as $$
declare it jsonb; amt int; sub int := 0; tsub int := 0; disc int; taxable int; tax int;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then raise exception 'Add at least one line item'; end if;
  for it in select * from jsonb_array_elements(items) loop
    amt := round((it->>'qty')::numeric * (it->>'unit_price_cents')::numeric)::int; sub := sub + amt;
    if coalesce((it->>'taxable')::boolean, true) then tsub := tsub + amt; end if;
  end loop;
  disc := least(greatest(coalesce(disc_in, 0), 0), sub);
  taxable := case when sub > 0 then tsub - round(disc * tsub::numeric / sub)::int else 0 end;
  tax := round(taxable * coalesce(rate, 0) / 100.0)::int;
  return jsonb_build_object('sub', sub, 'disc', disc, 'tax', tax, 'total', sub - disc + tax);
end $$;

create sequence if not exists public.estimate_number_seq start 1001;
create table if not exists public.estimates (
  id bigint generated always as identity primary key, number text unique not null, view_key uuid not null default gen_random_uuid(),
  customer_id uuid references public.profiles(id) on delete set null, customer_name text not null check (length(btrim(customer_name)) > 0),
  customer_email text not null default '', customer_address text not null default '', issue_date date not null default current_date, expires_on date not null default (current_date + 30),
  status text not null default 'draft' check (status in ('draft','sent','accepted','declined','converted')),
  notes text not null default '' check (length(notes) <= 3000), terms text not null default '' check (length(terms) <= 3000),
  discount_cents int not null default 0 check (discount_cents >= 0), tax_rate numeric not null default 0, tax_label text not null default '',
  subtotal_cents int not null default 0, tax_cents int not null default 0, total_cents int not null default 0,
  invoice_id bigint references public.invoices(id) on delete set null, sent_at timestamptz, responded_at timestamptz,
  created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.estimate_items (
  id bigint generated always as identity primary key, estimate_id bigint not null references public.estimates(id) on delete cascade,
  description text not null check (length(btrim(description)) between 1 and 500), qty numeric(12,3) not null default 1 check (qty > 0),
  unit_price_cents int not null default 0, taxable boolean not null default true, product_id bigint references public.products(id) on delete set null, sort int not null default 0);
alter table public.estimates enable row level security; alter table public.estimate_items enable row level security;
drop policy if exists "view estimates" on public.estimates;
create policy "view estimates" on public.estimates for select using (public.has_perm('invoices.view') or (customer_id = auth.uid() and status <> 'draft'));
drop policy if exists "view estimate items" on public.estimate_items;
create policy "view estimate items" on public.estimate_items for select using (exists (select 1 from public.estimates e where e.id = estimate_id and (public.has_perm('invoices.view') or (e.customer_id = auth.uid() and e.status <> 'draft'))));

-- internal helper: create an invoice from JSON (no permission check; callers decide who may)
create or replace function public.make_invoice(inv jsonb, items jsonb) returns bigint language plpgsql security definer set search_path = public as $$
declare iid bigint; it jsonb; n int := 0; t jsonb; rate numeric := coalesce(nullif(inv->>'tax_rate', '')::numeric, 0);
begin
  t := public.doc_totals(items, coalesce(nullif(inv->>'discount_cents', '')::int, 0), rate);
  insert into invoices (number, customer_id, customer_name, customer_email, customer_address, issue_date, due_date, notes, terms, discount_cents, tax_rate, tax_label, subtotal_cents, tax_cents, total_cents)
  values (public.store_cfg_text('invoice_prefix', 'INV') || '-' || nextval('public.invoice_number_seq'), nullif(inv->>'customer_id', '')::uuid, btrim(inv->>'customer_name'), coalesce(inv->>'customer_email', ''), coalesce(inv->>'customer_address', ''),
    coalesce(nullif(inv->>'issue_date', '')::date, current_date), coalesce(nullif(inv->>'due_date', '')::date, current_date + 14), coalesce(inv->>'notes', ''), coalesce(inv->>'terms', ''),
    (t->>'disc')::int, rate, coalesce(inv->>'tax_label', ''), (t->>'sub')::int, (t->>'tax')::int, (t->>'total')::int) returning id into iid;
  for it in select * from jsonb_array_elements(items) loop
    n := n + 1;
    insert into invoice_items (invoice_id, description, qty, unit_price_cents, taxable, product_id, sort)
    values (iid, btrim(it->>'description'), (it->>'qty')::numeric, (it->>'unit_price_cents')::int, coalesce((it->>'taxable')::boolean, true), nullif(it->>'product_id', '')::bigint, n);
  end loop;
  return iid;
end $$;
revoke all on function public.make_invoice(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.save_estimate(est jsonb, items jsonb) returns bigint language plpgsql security definer set search_path = public as $$
declare eid bigint := nullif(est->>'id', '')::bigint; it jsonb; n int := 0; t jsonb; rate numeric; lbl text; cur record;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  rate := coalesce(nullif(est->>'tax_rate', '')::numeric, public.store_cfg('tax_rate', 0)); lbl := coalesce(nullif(est->>'tax_label', ''), public.store_cfg_text('tax_label', 'Tax'));
  t := public.doc_totals(items, coalesce(nullif(est->>'discount_cents', '')::int, 0), rate);
  if eid is null then
    insert into estimates (number, customer_id, customer_name, customer_email, customer_address, issue_date, expires_on, notes, terms, discount_cents, tax_rate, tax_label, subtotal_cents, tax_cents, total_cents)
    values ('EST-' || nextval('public.estimate_number_seq'), nullif(est->>'customer_id', '')::uuid, btrim(est->>'customer_name'), coalesce(est->>'customer_email', ''), coalesce(est->>'customer_address', ''),
      coalesce(nullif(est->>'issue_date', '')::date, current_date), coalesce(nullif(est->>'expires_on', '')::date, current_date + 30), coalesce(est->>'notes', ''), coalesce(est->>'terms', ''),
      (t->>'disc')::int, rate, lbl, (t->>'sub')::int, (t->>'tax')::int, (t->>'total')::int) returning id into eid;
    perform audit('estimate.created', 'estimate', eid::text, '{}');
  else
    select * into cur from estimates where id = eid for update; if not found then raise exception 'No such estimate'; end if;
    if cur.status not in ('draft', 'sent') then raise exception 'This estimate is % and can no longer be edited', cur.status; end if;
    update estimates set customer_id = nullif(est->>'customer_id', '')::uuid, customer_name = btrim(est->>'customer_name'), customer_email = coalesce(est->>'customer_email', ''), customer_address = coalesce(est->>'customer_address', ''),
      issue_date = coalesce(nullif(est->>'issue_date', '')::date, issue_date), expires_on = coalesce(nullif(est->>'expires_on', '')::date, expires_on), notes = coalesce(est->>'notes', ''), terms = coalesce(est->>'terms', ''),
      discount_cents = (t->>'disc')::int, tax_rate = rate, tax_label = lbl, subtotal_cents = (t->>'sub')::int, tax_cents = (t->>'tax')::int, total_cents = (t->>'total')::int, updated_at = now() where id = eid;
    delete from estimate_items where estimate_id = eid;
  end if;
  for it in select * from jsonb_array_elements(items) loop
    n := n + 1;
    insert into estimate_items (estimate_id, description, qty, unit_price_cents, taxable, product_id, sort)
    values (eid, btrim(it->>'description'), (it->>'qty')::numeric, (it->>'unit_price_cents')::int, coalesce((it->>'taxable')::boolean, true), nullif(it->>'product_id', '')::bigint, n);
  end loop;
  return eid;
end $$;

create or replace function public.set_estimate_status(eid bigint, new_status text) returns void language plpgsql security definer set search_path = public as $$
declare e public.estimates;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into e from estimates where id = eid for update; if not found then raise exception 'No such estimate'; end if;
  if e.status = 'converted' then raise exception 'This estimate was already converted to an invoice'; end if;
  if new_status = 'sent' then
    update estimates set status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now() where id = eid;
    perform notify_user(e.customer_id, 'invoice', 'Estimate ' || e.number || ' from the store', 'Total $' || to_char(e.total_cents / 100.0, 'FM999990.00') || ', valid until ' || e.expires_on, '#/estimate/' || eid);
    perform public.send_notification('estimate_sent', jsonb_build_object('estimate_id', eid));
  elsif new_status in ('draft', 'accepted', 'declined') then
    update estimates set status = new_status, responded_at = case when new_status in ('accepted', 'declined') then now() else null end, updated_at = now() where id = eid;
  else raise exception 'Unknown status'; end if;
  perform audit('estimate.' || new_status, 'estimate', eid::text, '{}');
end $$;

create or replace function public.respond_estimate(eid bigint, k uuid, accept boolean) returns void language plpgsql security definer set search_path = public as $$
declare e public.estimates;
begin
  select * into e from estimates where id = eid and view_key = k and status = 'sent' for update;
  if not found then raise exception 'This estimate can no longer be answered'; end if;
  if e.expires_on < current_date then raise exception 'This estimate has expired'; end if;
  update estimates set status = case when accept then 'accepted' else 'declined' end, responded_at = now(), updated_at = now() where id = eid;
  perform notify_admins('invoice', 'Estimate ' || e.number || case when accept then ' accepted' else ' declined' end, e.customer_name || ' · $' || to_char(e.total_cents / 100.0, 'FM999990.00'), '#/admin/estimates/' || eid);
end $$;

create or replace function public.convert_estimate(eid bigint) returns bigint language plpgsql security definer set search_path = public as $$
declare e public.estimates; iid bigint; its jsonb;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into e from estimates where id = eid for update; if not found then raise exception 'No such estimate'; end if;
  if e.status = 'converted' then raise exception 'Already converted'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', description, 'qty', qty, 'unit_price_cents', unit_price_cents, 'taxable', taxable, 'product_id', product_id) order by sort), '[]') into its from estimate_items where estimate_id = eid;
  iid := public.make_invoice(jsonb_build_object('customer_id', e.customer_id, 'customer_name', e.customer_name, 'customer_email', e.customer_email, 'customer_address', e.customer_address,
    'due_date', current_date + coalesce(public.store_cfg('invoice_due_days', 14), 14)::int, 'notes', e.notes, 'terms', e.terms, 'discount_cents', e.discount_cents, 'tax_rate', e.tax_rate, 'tax_label', e.tax_label), its);
  update estimates set status = 'converted', invoice_id = iid, updated_at = now() where id = eid;
  perform audit('estimate.converted', 'estimate', eid::text, jsonb_build_object('invoice_id', iid));
  return iid;
end $$;

create or replace function public.delete_estimate(eid bigint) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  if (select status from estimates where id = eid) = 'converted' then raise exception 'Converted estimates are kept for your records'; end if;
  delete from estimates where id = eid; perform audit('estimate.deleted', 'estimate', eid::text, '{}');
end $$;

create or replace function public.get_estimate_public(eid bigint, k uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(e) - 'view_key' - 'created_by' || jsonb_build_object('items', (select coalesce(jsonb_agg(to_jsonb(x) order by x.sort), '[]') from estimate_items x where x.estimate_id = e.id))
  from estimates e where e.id = eid and e.view_key = k and e.status <> 'draft' $$;

-- recurring invoices
create table if not exists public.recurring_invoices (
  id bigint generated always as identity primary key, name text not null check (length(btrim(name)) between 1 and 120), customer_id uuid references public.profiles(id) on delete set null,
  customer_name text not null check (length(btrim(customer_name)) > 0), customer_email text not null default '', customer_address text not null default '',
  frequency text not null check (frequency in ('weekly','monthly','quarterly','yearly')), every int not null default 1 check (every between 1 and 24),
  next_run date not null, end_date date, due_days int not null default 14 check (due_days between 0 and 365), auto_send boolean not null default false, active boolean not null default true,
  items jsonb not null default '[]', discount_cents int not null default 0, tax_rate numeric not null default 0, tax_label text not null default '', notes text not null default '', terms text not null default '',
  last_invoice_id bigint references public.invoices(id) on delete set null, runs int not null default 0, created_by uuid default auth.uid(), created_at timestamptz not null default now());
alter table public.recurring_invoices enable row level security;
drop policy if exists "view recurring" on public.recurring_invoices;
create policy "view recurring" on public.recurring_invoices for select using (public.has_perm('invoices.view'));

create or replace function public.save_recurring(rec jsonb, items jsonb) returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint := nullif(rec->>'id', '')::bigint; rate numeric := coalesce(nullif(rec->>'tax_rate', '')::numeric, 0);
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  perform public.doc_totals(items, coalesce(nullif(rec->>'discount_cents', '')::int, 0), rate); -- validates the lines
  if rid is null then
    insert into recurring_invoices (name, customer_id, customer_name, customer_email, customer_address, frequency, every, next_run, end_date, due_days, auto_send, items, discount_cents, tax_rate, tax_label, notes, terms)
    values (btrim(rec->>'name'), nullif(rec->>'customer_id', '')::uuid, btrim(rec->>'customer_name'), coalesce(rec->>'customer_email', ''), coalesce(rec->>'customer_address', ''), rec->>'frequency', coalesce(nullif(rec->>'every', '')::int, 1),
      (rec->>'next_run')::date, nullif(rec->>'end_date', '')::date, coalesce(nullif(rec->>'due_days', '')::int, 14), coalesce((rec->>'auto_send')::boolean, false), items, coalesce(nullif(rec->>'discount_cents', '')::int, 0), rate, coalesce(rec->>'tax_label', ''), coalesce(rec->>'notes', ''), coalesce(rec->>'terms', ''))
    returning id into rid;
  else
    update recurring_invoices set name = btrim(rec->>'name'), customer_id = nullif(rec->>'customer_id', '')::uuid, customer_name = btrim(rec->>'customer_name'), customer_email = coalesce(rec->>'customer_email', ''), customer_address = coalesce(rec->>'customer_address', ''),
      frequency = rec->>'frequency', every = coalesce(nullif(rec->>'every', '')::int, 1), next_run = (rec->>'next_run')::date, end_date = nullif(rec->>'end_date', '')::date, due_days = coalesce(nullif(rec->>'due_days', '')::int, 14),
      auto_send = coalesce((rec->>'auto_send')::boolean, false), items = save_recurring.items, discount_cents = coalesce(nullif(rec->>'discount_cents', '')::int, 0), tax_rate = rate, tax_label = coalesce(rec->>'tax_label', ''), notes = coalesce(rec->>'notes', ''), terms = coalesce(rec->>'terms', '') where id = rid;
    if not found then raise exception 'No such recurring invoice'; end if;
  end if;
  return rid;
end $$;
create or replace function public.set_recurring_active(rid bigint, on_off boolean) returns void language plpgsql security definer set search_path = public as $$
begin if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if; update recurring_invoices set active = on_off where id = rid; end $$;
create or replace function public.delete_recurring(rid bigint) returns void language plpgsql security definer set search_path = public as $$
begin if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if; delete from recurring_invoices where id = rid; end $$;

create or replace function public.run_recurring_internal() returns int language plpgsql security definer set search_path = public as $$
declare r record; iid bigint; made int := 0; guard int; step interval;
begin
  for r in select * from recurring_invoices where active and next_run <= current_date and (end_date is null or next_run <= end_date) order by id for update loop
    guard := 0;
    while r.next_run <= current_date and (r.end_date is null or r.next_run <= r.end_date) and guard < 12 loop
      guard := guard + 1;
      iid := public.make_invoice(jsonb_build_object('customer_id', r.customer_id, 'customer_name', r.customer_name, 'customer_email', r.customer_email, 'customer_address', r.customer_address,
        'issue_date', r.next_run, 'due_date', r.next_run + r.due_days, 'notes', r.notes, 'terms', r.terms, 'discount_cents', r.discount_cents, 'tax_rate', r.tax_rate, 'tax_label', r.tax_label), r.items);
      made := made + 1;
      if r.auto_send then
        update invoices set status = 'sent', sent_at = now() where id = iid;
        perform notify_user(r.customer_id, 'invoice', 'New invoice from the store', r.name, '#/invoice/' || iid);
        perform public.send_notification('invoice_sent', jsonb_build_object('invoice_id', iid));
      end if;
      perform notify_admins('invoice', 'Recurring invoice created', r.name || ' · ' || r.customer_name, '#/admin/invoices/' || iid);
      step := case r.frequency when 'weekly' then make_interval(days => 7 * r.every) when 'monthly' then make_interval(months => r.every) when 'quarterly' then make_interval(months => 3 * r.every) else make_interval(years => r.every) end;
      r.next_run := (r.next_run + step)::date; r.runs := r.runs + 1;
      update recurring_invoices set next_run = r.next_run, runs = r.runs, last_invoice_id = iid, active = (end_date is null or r.next_run <= end_date) where id = r.id;
    end loop;
  end loop;
  return made;
end $$;
create or replace function public.run_recurring_invoices() returns int language plpgsql security definer set search_path = public as $$
begin if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if; return public.run_recurring_internal(); end $$;

-- online invoice payments (called by the Stripe webhook with the service role)
create unique index if not exists invoice_payments_ref_uq on public.invoice_payments (invoice_id, reference) where reference <> '';
create or replace function public.record_invoice_payment_system(iid bigint, amount int, pay_method text, ref text) returns void language plpgsql security definer set search_path = public as $$
declare inv public.invoices; amt int;
begin
  select * into inv from invoices where id = iid for update; if not found or inv.status = 'void' then return; end if;
  if exists (select 1 from invoice_payments where invoice_id = iid and reference = ref and ref <> '') then return; end if;
  amt := least(amount, inv.total_cents - inv.paid_cents); if amt < 1 then return; end if;
  insert into invoice_payments (invoice_id, amount_cents, method, reference, note, created_by) values (iid, amt, pay_method, ref, 'Paid online', null);
  update invoices set paid_cents = paid_cents + amt, status = case when paid_cents + amt >= total_cents then 'paid' else status end, sent_at = coalesce(sent_at, now()), updated_at = now() where id = iid;
  perform notify_admins('invoice', 'Online payment on ' || inv.number, '$' || to_char(amt / 100.0, 'FM999990.00') || ' from ' || inv.customer_name, '#/admin/invoices/' || iid);
  perform audit('invoice.payment', 'invoice', iid::text, jsonb_build_object('amount_cents', amt, 'method', pay_method));
end $$;

revoke all on function public.save_estimate(jsonb, jsonb), public.set_estimate_status(bigint, text), public.convert_estimate(bigint), public.delete_estimate(bigint), public.save_recurring(jsonb, jsonb),
  public.set_recurring_active(bigint, boolean), public.delete_recurring(bigint), public.run_recurring_invoices() from public, anon;
grant execute on function public.save_estimate(jsonb, jsonb), public.set_estimate_status(bigint, text), public.convert_estimate(bigint), public.delete_estimate(bigint), public.save_recurring(jsonb, jsonb),
  public.set_recurring_active(bigint, boolean), public.delete_recurring(bigint), public.run_recurring_invoices() to authenticated;
grant execute on function public.get_estimate_public(bigint, uuid), public.respond_estimate(bigint, uuid, boolean) to anon, authenticated;
revoke all on function public.run_recurring_internal(), public.record_invoice_payment_system(bigint, int, text, text), public.doc_totals(jsonb, int, numeric) from public, anon, authenticated;
grant execute on function public.record_invoice_payment_system(bigint, int, text, text) to service_role;

-- daily job for recurring invoices (Supabase pg_cron); also runnable from Admin → Invoices → Recurring
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('recurring-invoices', '15 6 * * *', 'select public.run_recurring_internal()');
exception when others then raise notice 'pg_cron not available: %', sqlerrm; end $$;

-- ===== Expenses (for profit & loss), statements, receipts =====
create table if not exists public.expenses (
  id bigint generated always as identity primary key, spent_on date not null default current_date, vendor text not null default '' check (length(vendor) <= 120),
  category text not null check (length(btrim(category)) between 1 and 60), description text not null default '' check (length(description) <= 500),
  amount_cents int not null check (amount_cents > 0), tax_cents int not null default 0 check (tax_cents >= 0), payment_method text not null default '' check (length(payment_method) <= 40),
  receipt_path text not null default '', created_by uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists expenses_date_idx on public.expenses (spent_on desc);
alter table public.expenses enable row level security;
drop policy if exists "view expenses" on public.expenses; create policy "view expenses" on public.expenses for select using (public.has_perm('expenses.view'));
drop policy if exists "manage expenses" on public.expenses; create policy "manage expenses" on public.expenses for all using (public.has_perm('expenses.manage')) with check (public.has_perm('expenses.manage'));
insert into public.role_permissions (role, perm) values ('accountant','expenses.view'), ('accountant','expenses.manage') on conflict do nothing;
create or replace function public.trg_audit_expense() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform audit('expense.deleted', 'expense', old.id::text, jsonb_build_object('amount_cents', old.amount_cents, 'category', old.category)); return old; end if;
  if tg_op = 'INSERT' then perform audit('expense.created', 'expense', new.id::text, jsonb_build_object('amount_cents', new.amount_cents, 'category', new.category, 'vendor', new.vendor)); end if;
  return new;
end $$;
drop trigger if exists audit_expense on public.expenses;
create trigger audit_expense after insert or delete on public.expenses for each row execute function public.trg_audit_expense();

-- private bucket for receipts
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('expense-receipts', 'expense-receipts', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "receipts insert" on storage.objects; create policy "receipts insert" on storage.objects for insert with check (bucket_id = 'expense-receipts' and public.has_perm('expenses.manage'));
drop policy if exists "receipts read" on storage.objects; create policy "receipts read" on storage.objects for select using (bucket_id = 'expense-receipts' and public.has_perm('expenses.view'));
drop policy if exists "receipts delete" on storage.objects; create policy "receipts delete" on storage.objects for delete using (bucket_id = 'expense-receipts' and public.has_perm('expenses.manage'));

-- email a statement of open invoices to a customer
create or replace function public.send_statement(cid uuid, mail text, nm text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  perform public.send_notification('statement', jsonb_build_object('customer_id', cid, 'email', coalesce(mail, ''), 'name', coalesce(nm, '')));
  perform audit('statement.sent', 'invoice', '', jsonb_build_object('customer', coalesce(nm, mail)));
end $$;
revoke all on function public.send_statement(uuid, text, text) from public, anon; grant execute on function public.send_statement(uuid, text, text) to authenticated;

-- ===== Usernames =====
alter table public.profiles add column if not exists username text;
alter table public.profiles drop constraint if exists username_format;
alter table public.profiles add constraint username_format check (username is null or username ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$');
create unique index if not exists profiles_username_uq on public.profiles (lower(username)) where username is not null;

create or replace function public.username_ok(u text) returns text language sql immutable as $$
  select case when u is null or u !~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,29}$' then 'Use 3–30 letters, numbers, dots, dashes or underscores, starting with a letter or number.'
              when lower(u) = any (array['admin','administrator','owner','root','support','staff','store','shop','system','moderator','mod','help','billing','sales','info','contact','team','official','null','undefined','me','you']) then 'That username is reserved.'
              else null end $$;
create or replace function public.username_available(u text) returns boolean language sql stable security definer set search_path = public as $$
  select public.username_ok(btrim(u)) is null and not exists (select 1 from profiles where lower(username) = lower(btrim(u))) $$;
grant execute on function public.username_ok(text), public.username_available(text) to anon, authenticated;

create or replace function public.set_username(u text) returns void language plpgsql security definer set search_path = public as $$
declare v text := btrim(u); msg text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  msg := public.username_ok(v); if msg is not null then raise exception '%', msg; end if;
  if exists (select 1 from profiles where lower(username) = lower(v) and id <> auth.uid()) then raise exception 'That username is taken'; end if;
  update profiles set username = v where id = auth.uid();
end $$;
revoke all on function public.set_username(text) from public, anon; grant execute on function public.set_username(text) to authenticated;

-- new accounts: take the username chosen at sign-up if it is valid and free (the account is still created either way)
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare un text := nullif(btrim(new.raw_user_meta_data->>'username'), '');
begin
  if un is not null and (public.username_ok(un) is not null or exists (select 1 from profiles where lower(username) = lower(un))) then un := null; end if;
  begin
    insert into public.profiles (id, name, email, username) values (new.id, coalesce(new.raw_user_meta_data->>'name',''), new.email, un);
  exception when unique_violation or check_violation then
    insert into public.profiles (id, name, email) values (new.id, coalesce(new.raw_user_meta_data->>'name',''), new.email);
  end;
  return new;
end $$;

-- ===== Sending invoices & estimates by email / text, with a delivery log =====
create table if not exists public.message_log (
  id bigint generated always as identity primary key, kind text not null, ref_id bigint, channel text not null check (channel in ('email','sms')),
  to_address text not null default '', status text not null default 'queued' check (status in ('queued','sent','failed','skipped')), detail text not null default '',
  created_by uuid default auth.uid(), created_at timestamptz not null default now());
create index if not exists message_log_idx on public.message_log (kind, ref_id, id desc);
alter table public.message_log enable row level security;
drop policy if exists "view message log" on public.message_log;
create policy "view message log" on public.message_log for select using (public.has_perm('invoices.view'));
alter table public.invoices add column if not exists customer_phone text not null default '' check (length(customer_phone) <= 40);
alter table public.estimates add column if not exists customer_phone text not null default '' check (length(customer_phone) <= 40);
alter table public.recurring_invoices add column if not exists customer_phone text not null default '' check (length(customer_phone) <= 40);

create or replace function public.messaging_ready() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_config where key = 'notify_url') and exists (select 1 from app_config where key = 'notify_secret') $$;
grant execute on function public.messaging_ready() to authenticated;

create or replace function public.set_doc_phone(doc text, did bigint, phone text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  if doc = 'invoice' then update invoices set customer_phone = left(btrim(coalesce(phone, '')), 40) where id = did;
  elsif doc = 'estimate' then update estimates set customer_phone = left(btrim(coalesce(phone, '')), 40) where id = did;
  elsif doc = 'recurring' then update recurring_invoices set customer_phone = left(btrim(coalesce(phone, '')), 40) where id = did;
  else raise exception 'Unknown document'; end if;
end $$;
revoke all on function public.set_doc_phone(text, bigint, text) from public, anon; grant execute on function public.set_doc_phone(text, bigint, text) to authenticated;

-- "mark as sent" no longer emails by itself; real sending goes through send_invoice / send_estimate below
create or replace function public.set_invoice_status(iid bigint, new_status text) returns void language plpgsql security definer set search_path = public as $$
declare inv public.invoices;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into inv from invoices where id = iid for update; if not found then raise exception 'No such invoice'; end if;
  if new_status = 'sent' then
    if inv.status = 'void' then raise exception 'Reopen the invoice first'; end if;
    update invoices set status = case when paid_cents >= total_cents and total_cents > 0 then 'paid' else 'sent' end, sent_at = coalesce(sent_at, now()), updated_at = now() where id = iid;
    perform notify_user(inv.customer_id, 'invoice', 'Invoice ' || inv.number || ' from the store', 'Total $' || to_char(inv.total_cents / 100.0, 'FM999990.00') || ', due ' || inv.due_date, '#/invoice/' || iid);
  elsif new_status = 'void' then
    if inv.paid_cents > 0 then raise exception 'Remove the recorded payments before voiding'; end if;
    update invoices set status = 'void', updated_at = now() where id = iid;
  elsif new_status = 'draft' then
    if inv.paid_cents > 0 then raise exception 'This invoice has payments and cannot go back to draft'; end if;
    update invoices set status = 'draft', updated_at = now() where id = iid;
  else raise exception 'Unknown status'; end if;
  perform audit('invoice.' || new_status, 'invoice', iid::text, '{}');
end $$;

create or replace function public.send_invoice(iid bigint, via_email boolean, via_sms boolean, base text, to_email text default null, to_phone text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare inv public.invoices; ready boolean := public.messaging_ready(); el bigint; sl bigint; b text := left(coalesce(base, ''), 300);
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into inv from invoices where id = iid for update; if not found then raise exception 'No such invoice'; end if;
  if inv.status = 'void' then raise exception 'This invoice is void'; end if;
  if b <> '' and b !~ '^https?://[^[:space:]]+$' then raise exception 'Invalid site address'; end if;
  if nullif(btrim(to_email), '') is not null then update invoices set customer_email = btrim(to_email) where id = iid; inv.customer_email := btrim(to_email); end if;
  if nullif(btrim(to_phone), '') is not null then update invoices set customer_phone = btrim(to_phone) where id = iid; inv.customer_phone := btrim(to_phone); end if;
  if via_email and inv.customer_email !~ '^\S+@\S+\.\S+$' then raise exception 'Enter a valid email address to email this invoice'; end if;
  if via_sms and length(regexp_replace(inv.customer_phone, '[^0-9]', '', 'g')) < 7 then raise exception 'Enter a mobile number to text this invoice'; end if;
  update invoices set status = case when paid_cents >= total_cents and total_cents > 0 then 'paid' else 'sent' end, sent_at = coalesce(sent_at, now()), updated_at = now() where id = iid;
  perform notify_user(inv.customer_id, 'invoice', 'Invoice ' || inv.number || ' from the store', 'Total $' || to_char(inv.total_cents / 100.0, 'FM999990.00') || ', due ' || inv.due_date, '#/invoice/' || iid);
  if via_email then insert into message_log (kind, ref_id, channel, to_address, status, detail) values ('invoice', iid, 'email', inv.customer_email, case when ready then 'queued' else 'skipped' end, case when ready then '' else 'Sending is not set up yet (see Settings → Messaging)' end) returning id into el; end if;
  if via_sms then insert into message_log (kind, ref_id, channel, to_address, status, detail) values ('invoice', iid, 'sms', inv.customer_phone, case when ready then 'queued' else 'skipped' end, case when ready then '' else 'Sending is not set up yet (see Settings → Messaging)' end) returning id into sl; end if;
  if ready and (via_email or via_sms) then
    perform public.send_notification('invoice_sent', jsonb_build_object('invoice_id', iid, 'base', b, 'channels', jsonb_build_object('email', via_email, 'sms', via_sms), 'log_ids', jsonb_build_object('email', el, 'sms', sl)));
  end if;
  perform audit('invoice.sent', 'invoice', iid::text, jsonb_build_object('email', via_email, 'sms', via_sms));
  return jsonb_build_object('ready', ready, 'email_log', el, 'sms_log', sl);
end $$;

create or replace function public.send_estimate(eid bigint, via_email boolean, via_sms boolean, base text, to_email text default null, to_phone text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e public.estimates; ready boolean := public.messaging_ready(); el bigint; sl bigint; b text := left(coalesce(base, ''), 300);
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into e from estimates where id = eid for update; if not found then raise exception 'No such estimate'; end if;
  if e.status in ('converted', 'accepted', 'declined') then raise exception 'This estimate is already %', e.status; end if;
  if b <> '' and b !~ '^https?://[^[:space:]]+$' then raise exception 'Invalid site address'; end if;
  if nullif(btrim(to_email), '') is not null then update estimates set customer_email = btrim(to_email) where id = eid; e.customer_email := btrim(to_email); end if;
  if nullif(btrim(to_phone), '') is not null then update estimates set customer_phone = btrim(to_phone) where id = eid; e.customer_phone := btrim(to_phone); end if;
  if via_email and e.customer_email !~ '^\S+@\S+\.\S+$' then raise exception 'Enter a valid email address to email this estimate'; end if;
  if via_sms and length(regexp_replace(e.customer_phone, '[^0-9]', '', 'g')) < 7 then raise exception 'Enter a mobile number to text this estimate'; end if;
  update estimates set status = 'sent', sent_at = coalesce(sent_at, now()), updated_at = now() where id = eid;
  perform notify_user(e.customer_id, 'invoice', 'Estimate ' || e.number || ' from the store', 'Total $' || to_char(e.total_cents / 100.0, 'FM999990.00') || ', valid until ' || e.expires_on, '#/estimate/' || eid);
  if via_email then insert into message_log (kind, ref_id, channel, to_address, status, detail) values ('estimate', eid, 'email', e.customer_email, case when ready then 'queued' else 'skipped' end, case when ready then '' else 'Sending is not set up yet (see Settings → Messaging)' end) returning id into el; end if;
  if via_sms then insert into message_log (kind, ref_id, channel, to_address, status, detail) values ('estimate', eid, 'sms', e.customer_phone, case when ready then 'queued' else 'skipped' end, case when ready then '' else 'Sending is not set up yet (see Settings → Messaging)' end) returning id into sl; end if;
  if ready and (via_email or via_sms) then
    perform public.send_notification('estimate_sent', jsonb_build_object('estimate_id', eid, 'base', b, 'channels', jsonb_build_object('email', via_email, 'sms', via_sms), 'log_ids', jsonb_build_object('email', el, 'sms', sl)));
  end if;
  perform audit('estimate.sent', 'estimate', eid::text, jsonb_build_object('email', via_email, 'sms', via_sms));
  return jsonb_build_object('ready', ready, 'email_log', el, 'sms_log', sl);
end $$;

drop function if exists public.send_statement(uuid, text, text);
create or replace function public.send_statement(cid uuid, mail text, nm text, base text default '') returns jsonb language plpgsql security definer set search_path = public as $$
declare ready boolean := public.messaging_ready(); lid bigint; b text := left(coalesce(base, ''), 300);
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  if b <> '' and b !~ '^https?://[^[:space:]]+$' then raise exception 'Invalid site address'; end if;
  insert into message_log (kind, ref_id, channel, to_address, status, detail) values ('statement', null, 'email', coalesce(mail, nm, ''), case when ready then 'queued' else 'skipped' end, case when ready then '' else 'Sending is not set up yet (see Settings → Messaging)' end) returning id into lid;
  if ready then perform public.send_notification('statement', jsonb_build_object('customer_id', cid, 'email', coalesce(mail, ''), 'name', coalesce(nm, ''), 'base', b, 'log_ids', jsonb_build_object('email', lid))); end if;
  perform audit('statement.sent', 'invoice', '', jsonb_build_object('customer', coalesce(nm, mail)));
  return jsonb_build_object('ready', ready, 'email_log', lid);
end $$;

create or replace function public.send_test_message(channel text, to_addr text, base text default '') returns jsonb language plpgsql security definer set search_path = public as $$
declare ready boolean := public.messaging_ready(); lid bigint;
begin
  if not public.has_perm('team.manage') then raise exception 'Not allowed'; end if;
  if channel not in ('email', 'sms') then raise exception 'Unknown channel'; end if;
  insert into message_log (kind, channel, to_address, status, detail) values ('test', channel, left(btrim(coalesce(to_addr, '')), 120), case when ready then 'queued' else 'skipped' end, case when ready then '' else 'The sending service is not connected yet' end) returning id into lid;
  if ready then perform public.send_notification('test', jsonb_build_object('channel', channel, 'to', left(btrim(to_addr), 120), 'log_id', lid)); end if;
  return jsonb_build_object('ready', ready, 'log', lid);
end $$;
revoke all on function public.send_invoice(bigint, boolean, boolean, text, text, text), public.send_estimate(bigint, boolean, boolean, text, text, text), public.send_statement(uuid, text, text, text), public.send_test_message(text, text, text) from public, anon;
grant execute on function public.send_invoice(bigint, boolean, boolean, text, text, text), public.send_estimate(bigint, boolean, boolean, text, text, text), public.send_statement(uuid, text, text, text), public.send_test_message(text, text, text) to authenticated;

-- convert/recurring keep the customer's phone
create or replace function public.convert_estimate(eid bigint) returns bigint language plpgsql security definer set search_path = public as $$
declare e public.estimates; iid bigint; its jsonb;
begin
  if not public.has_perm('invoices.manage') then raise exception 'Not allowed'; end if;
  select * into e from estimates where id = eid for update; if not found then raise exception 'No such estimate'; end if;
  if e.status = 'converted' then raise exception 'Already converted'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('description', description, 'qty', qty, 'unit_price_cents', unit_price_cents, 'taxable', taxable, 'product_id', product_id) order by sort), '[]') into its from estimate_items where estimate_id = eid;
  iid := public.make_invoice(jsonb_build_object('customer_id', e.customer_id, 'customer_name', e.customer_name, 'customer_email', e.customer_email, 'customer_address', e.customer_address,
    'due_date', current_date + coalesce(public.store_cfg('invoice_due_days', 14), 14)::int, 'notes', e.notes, 'terms', e.terms, 'discount_cents', e.discount_cents, 'tax_rate', e.tax_rate, 'tax_label', e.tax_label), its);
  update invoices set customer_phone = e.customer_phone where id = iid;
  update estimates set status = 'converted', invoice_id = iid, updated_at = now() where id = eid;
  perform audit('estimate.converted', 'estimate', eid::text, jsonb_build_object('invoice_id', iid));
  return iid;
end $$;
do $$ declare def text; begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'run_recurring_internal';
  def := replace(def, 'made := made + 1;', 'update invoices set customer_phone = r.customer_phone where id = iid; made := made + 1;');
  execute def;
end $$;

-- estimates: "mark as sent" records the status only; sending goes through send_estimate
do $$ declare def text; begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_estimate_status';
  def := replace(def, 'perform public.send_notification(''estimate_sent'', jsonb_build_object(''estimate_id'', eid));', '');
  execute def;
end $$;

-- ===== Messaging upgrade: attachments, order references, internal notes, unsend, quick replies =====
alter table public.messages add column if not exists attachments jsonb not null default '[]' check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 6);
alter table public.messages add column if not exists order_id bigint references public.orders(id) on delete set null;
alter table public.messages add column if not exists internal boolean not null default false;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (length(body) <= 5000 and (length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0 or order_id is not null));

drop policy if exists "view messages" on public.messages;
create policy "view messages" on public.messages for select using (
  exists (select 1 from public.conversations c where c.id = conversation_id and (c.customer_id = auth.uid() or public.is_admin())) and (not internal or public.has_perm('messages')));
drop policy if exists "staff view messages" on public.messages;
create policy "staff view messages" on public.messages for select using (public.has_perm('messages'));
drop policy if exists "send message" on public.messages;
create policy "send message" on public.messages for insert with check (sender_id = auth.uid() and (not internal or public.has_perm('messages')) and exists (
  select 1 from public.conversations c where c.id = conversation_id and (public.is_admin() or (c.customer_id = auth.uid() and not c.closed))));

-- internal notes never notify or email the customer
create or replace function public.trg_msg_after() returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversations; who text; prev text;
begin
  select * into c from conversations where id = new.conversation_id;
  update conversations set last_message_at = new.created_at where id = c.id;
  if new.internal then return new; end if;
  prev := coalesce(nullif(btrim(new.body), ''), case when jsonb_array_length(new.attachments) > 0 then '[attachment]' else '[order]' end);
  if new.sender_id = c.customer_id then
    select coalesce(nullif(name, ''), email) into who from profiles where id = c.customer_id;
    perform notify_admins('message', 'New message from ' || coalesce(who, 'a customer'), c.subject || ': ' || left(prev, 120), '#/messages/' || c.id);
  else
    perform notify_user(c.customer_id, 'message', 'New reply from the store team', c.subject || ': ' || left(prev, 120), '#/messages/' || c.id);
  end if;
  perform public.send_notification('new_message', jsonb_build_object('message_id', new.id));
  return new;
end $$;

-- unsend: the sender can retract a message within 10 minutes
create or replace function public.delete_message(mid bigint) returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  select * into m from messages where id = mid for update; if not found then raise exception 'No such message'; end if;
  if m.sender_id <> auth.uid() then raise exception 'You can only unsend your own messages'; end if;
  if m.created_at < now() - interval '10 minutes' then raise exception 'Messages can only be unsent within 10 minutes'; end if;
  update messages set body = '', attachments = '[]', order_id = null, deleted_at = now() where id = mid;
end $$;
revoke all on function public.delete_message(bigint) from public, anon; grant execute on function public.delete_message(bigint) to authenticated;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (length(body) <= 5000 and (deleted_at is not null or length(btrim(body)) > 0 or jsonb_array_length(attachments) > 0 or order_id is not null));

create table if not exists public.canned_replies (
  id bigint generated always as identity primary key, title text not null check (length(btrim(title)) between 1 and 60), body text not null check (length(btrim(body)) between 1 and 2000),
  created_by uuid default auth.uid(), created_at timestamptz not null default now());
alter table public.canned_replies enable row level security;
drop policy if exists "staff canned replies" on public.canned_replies;
create policy "staff canned replies" on public.canned_replies for all using (public.has_perm('messages')) with check (public.has_perm('messages'));
insert into public.canned_replies (title, body) select * from (values
  ('Thanks / received', 'Thanks for your message — we have it and will get back to you shortly.'),
  ('Order shipped', 'Good news — your order has shipped. You can follow it from the Orders section of your account.'),
  ('Need more info', 'Could you tell us a bit more (room size, location and what you are insulating)? That will help us recommend the right product.')) v(t, b)
where not exists (select 1 from public.canned_replies);

-- private bucket for message attachments; files live under conv_<conversation id>/ and only that conversation's people can read them
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('message-files', 'message-files', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/gif','application/pdf','text/plain','text/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create or replace function public.can_access_conversation(cid_text text) returns boolean language sql stable security definer set search_path = public as $$
  select cid_text ~ '^conv_[0-9]+$' and exists (select 1 from conversations c where c.id = substr(cid_text, 6)::bigint and (c.customer_id = auth.uid() or public.has_perm('messages'))) $$;
grant execute on function public.can_access_conversation(text) to authenticated;
drop policy if exists "message files read" on storage.objects; create policy "message files read" on storage.objects for select using (bucket_id = 'message-files' and public.can_access_conversation((storage.foldername(name))[1]));
drop policy if exists "message files upload" on storage.objects; create policy "message files upload" on storage.objects for insert with check (bucket_id = 'message-files' and public.can_access_conversation((storage.foldername(name))[1]));

-- ===== Shop open / closed =====
create or replace function public.trg_orders_shop_closed() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source = 'online' and coalesce((select (value->>'closed')::boolean from site_settings where key = 'store'), false) then
    raise exception 'The shop is closed and not taking online orders right now.';
  end if;
  return new;
end $$;
drop trigger if exists orders_shop_closed on public.orders;
create trigger orders_shop_closed before insert on public.orders for each row execute function public.trg_orders_shop_closed();

-- ===== SEO tools =====
alter table public.products add column if not exists seo_title text not null default '' check (length(seo_title) <= 120);
alter table public.products add column if not exists seo_description text not null default '' check (length(seo_description) <= 320);
alter table public.products add column if not exists image_alt text not null default '' check (length(image_alt) <= 200);
alter table public.pages add column if not exists seo_title text not null default '' check (length(seo_title) <= 120);
alter table public.pages add column if not exists seo_description text not null default '' check (length(seo_description) <= 320);
-- site-wide SEO settings live in site_settings key 'seo' (site_title, description, og_image, site_url, noindex)

-- ===== Page version history =====
create table if not exists public.page_versions (
  id bigint generated always as identity primary key, page_id bigint not null references public.pages(id) on delete cascade,
  title text not null, body text not null, author text not null default '', created_at timestamptz not null default now());
create index if not exists page_versions_page_idx on public.page_versions (page_id, id desc);
alter table public.page_versions enable row level security;
drop policy if exists "admin page versions" on public.page_versions;
create policy "admin page versions" on public.page_versions for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.trg_page_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.body is distinct from new.body or old.title is distinct from new.title) then
    insert into page_versions (page_id, title, body, author) values (old.id, old.title, old.body, coalesce((select name from profiles where id = auth.uid()), ''));
    delete from page_versions where page_id = old.id and id not in (select id from page_versions where page_id = old.id order by id desc limit 25);
  end if;
  return new;
end $$;
drop trigger if exists pages_version on public.pages;
create trigger pages_version before update on public.pages for each row execute function public.trg_page_version();

-- Free shipping threshold of 0 means "never free" (as the Settings page says), not "always free".
CREATE OR REPLACE FUNCTION public.place_order(items jsonb, customer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := public.store_cfg('free_over_cents', 50000)::int; flat int := public.store_cfg('ship_flat_cents', 1500)::int;
  rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
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
  ship := case when pickup or (free_over > 0 and sub - disc >= free_over) then 0 else flat end;
  tax := round((sub - disc + ship) * rate / 100.0)::int;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source, tax_cents, tax_label)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship + tax, disc, code, pref,
          case when pickup then 'pickup' else 'delivery' end, 'online', tax, case when tax > 0 then tlabel else '' end)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name, p.price_cents, q) returning id into item_id;
    perform public.allocate_stock(item_id, p.id, q, pref, pickup, oid);
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $function$
;

-- ===== Sale pricing & back-in-stock alerts =====
alter table public.products add column if not exists compare_at_cents int not null default 0 check (compare_at_cents >= 0);
create table if not exists public.stock_alerts (
  id bigint generated always as identity primary key, product_id bigint not null references public.products(id) on delete cascade,
  email text not null check (length(email) between 5 and 200), created_at timestamptz not null default now(), unique (product_id, email));
alter table public.stock_alerts enable row level security;
drop policy if exists "admin stock alerts" on public.stock_alerts;
create policy "admin stock alerts" on public.stock_alerts for all using (public.is_admin()) with check (public.is_admin());
create or replace function public.notify_when_back(pid bigint, addr text) returns void language plpgsql security definer set search_path = public as $$
begin
  addr := lower(trim(addr));
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if not exists (select 1 from products where id = pid and active) then raise exception 'Product not found'; end if;
  insert into stock_alerts (product_id, email) values (pid, addr) on conflict do nothing;
end $$;
revoke all on function public.notify_when_back(bigint, text) from public;
grant execute on function public.notify_when_back(bigint, text) to anon, authenticated;

-- ===== Discount code limits =====
alter table public.discount_codes add column if not exists expires_at timestamptz;
alter table public.discount_codes add column if not exists max_uses int not null default 0 check (max_uses >= 0);
alter table public.discount_codes add column if not exists uses int not null default 0;
create or replace function public.check_code(c text, subtotal int) returns int language sql stable security definer set search_path = public as $$
  select percent from discount_codes where code = upper(trim(c)) and active and subtotal >= min_cents
    and (expires_at is null or expires_at > now()) and (max_uses = 0 or uses < max_uses) $$;
create or replace function public.trg_count_code() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.promo_code is not null and new.promo_code <> '' then update discount_codes set uses = uses + 1 where code = upper(new.promo_code); end if;
  return new;
end $$;
drop trigger if exists orders_count_code on public.orders;
create trigger orders_count_code after insert on public.orders for each row execute function public.trg_count_code();

-- ===== PDF attachments on sent invoices/estimates =====
insert into storage.buckets (id, name, public) values ('doc-pdfs', 'doc-pdfs', false) on conflict (id) do nothing;
drop policy if exists "staff write doc pdfs" on storage.objects;
create policy "staff write doc pdfs" on storage.objects for insert to authenticated with check (bucket_id = 'doc-pdfs' and public.has_perm('invoices.manage'));
drop policy if exists "staff update doc pdfs" on storage.objects;
create policy "staff update doc pdfs" on storage.objects for update to authenticated using (bucket_id = 'doc-pdfs' and public.has_perm('invoices.manage'));
drop policy if exists "staff read doc pdfs" on storage.objects;
create policy "staff read doc pdfs" on storage.objects for select to authenticated using (bucket_id = 'doc-pdfs' and public.has_perm('invoices.view'));

-- ===== Shop closed until a date =====
create or replace function public.trg_orders_shop_closed() returns trigger language plpgsql security definer set search_path = public as $$
declare s jsonb;
begin
  select value into s from site_settings where key = 'store';
  if new.source = 'online' and coalesce((s->>'closed')::boolean, false)
     and (coalesce(s->>'closed_until', '') = '' or (s->>'closed_until')::date > current_date) then
    raise exception 'The shop is closed and not taking online orders right now.';
  end if;
  return new;
end $$;

-- ===== Bundle / pack pricing (bags vs bundles) =====
-- Stock is always counted in the product's base unit (e.g. bags). A pack gives a lower price per base unit
-- when you buy at least `units` of them: 10 bags with an 8-bag bundle price = 8 at the bundle price + 2 at the normal price.
create table if not exists public.product_packs (
  id bigint generated always as identity primary key, product_id bigint not null references public.products(id) on delete cascade,
  label text not null check (length(label) between 1 and 60), units int not null check (units between 2 and 10000),
  unit_price_cents int not null check (unit_price_cents >= 0), unique (product_id, units));
alter table public.product_packs enable row level security;
drop policy if exists "read packs" on public.product_packs;
create policy "read packs" on public.product_packs for select using (true);
drop policy if exists "staff packs" on public.product_packs;
create policy "staff packs" on public.product_packs for all using (public.has_perm('catalog.manage')) with check (public.has_perm('catalog.manage'));

create or replace function public.pack_split(pid bigint, base int, q int) returns table(qty int, price int, label text)
language plpgsql stable security definer set search_path = public as $$
declare r record; n int; rest int := q;
begin
  for r in select * from product_packs where product_id = pid and unit_price_cents < base order by units desc loop
    n := rest / r.units;
    if n > 0 then qty := n * r.units; price := r.unit_price_cents; label := r.label; return next; rest := rest - qty; end if;
  end loop;
  if rest > 0 then qty := rest; price := base; label := ''; return next; end if;
end $$;
create or replace function public.pack_total(pid bigint, base int, q int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty * price), 0)::int from public.pack_split(pid, base, q) $$;
grant execute on function public.pack_split(bigint, int, int), public.pack_total(bigint, int, int) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_order(items jsonb, customer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pk record; it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := public.store_cfg('free_over_cents', 50000)::int; flat int := public.store_cfg('ship_flat_cents', 1500)::int;
  rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
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
    sub := sub + public.pack_total(p.id, p.price_cents, q);
  end loop;
  if code is not null then
    pct := public.check_code(code, sub);
    if pct is null then raise exception 'That discount code is not valid'; end if;
    disc := sub * pct / 100;
  end if;
  ship := case when pickup or (free_over > 0 and sub - disc >= free_over) then 0 else flat end;
  tax := round((sub - disc + ship) * rate / 100.0)::int;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source, tax_cents, tax_label)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship + tax, disc, code, pref,
          case when pickup then 'pickup' else 'delivery' end, 'online', tax, case when tax > 0 then tlabel else '' end)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    for pk in select * from public.pack_split(p.id, p.price_cents, q) loop
      insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name || case when pk.label <> '' then ' (' || pk.label || ' price)' else '' end, pk.price, pk.qty) returning id into item_id;
      perform public.allocate_stock(item_id, p.id, pk.qty, pref, pickup, oid);
    end loop;
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $function$
;

CREATE OR REPLACE FUNCTION public.record_sale(loc_id bigint, items jsonb, customer jsonb, payment text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pk record; it jsonb; p public.products; q int; sub int := 0; oid bigint; item_id bigint; loc public.locations; rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
begin
  if not public.has_perm('pos') then raise exception 'Not allowed'; end if;
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
    for pk in select * from public.pack_split(p.id, p.price_cents, q) loop
      insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name || case when pk.label <> '' then ' (' || pk.label || ' price)' else '' end, pk.price, pk.qty) returning id into item_id;
      begin perform public.allocate_stock(item_id, p.id, pk.qty, loc.id, true, oid);
      exception when others then raise exception 'Not enough stock of % at %', p.name, loc.name; end;
    end loop;
    sub := sub + public.pack_total(p.id, p.price_cents, q);
  end loop;
  tax := round(sub * rate / 100.0)::int;
  update orders set subtotal_cents = sub, tax_cents = tax, tax_label = case when tax > 0 then tlabel else '' end, total_cents = sub + tax where id = oid;
  return oid;
end $function$
;

-- ===== Brands =====
alter table public.products add column if not exists brand text not null default '' check (length(brand) <= 60);
create table if not exists public.brands (
  id bigint generated always as identity primary key, name text not null check (length(btrim(name)) between 1 and 60), created_at timestamptz not null default now());
create unique index if not exists brands_name_key on public.brands (lower(btrim(name)));
alter table public.brands enable row level security;
drop policy if exists "read brands" on public.brands;
create policy "read brands" on public.brands for select using (true);
-- Anyone who can manage the catalog OR the inventory may add brands and assign them to products (via these functions).
create or replace function public.can_brand() returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('catalog.manage') or public.has_perm('inventory.manage') $$;
create or replace function public.add_brand(nm text) returns text language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(nm, '')); ex text;
begin
  if not public.can_brand() then raise exception 'Not allowed'; end if;
  if n = '' then return ''; end if; if length(n) > 60 then raise exception 'Brand name is too long'; end if;
  select name into ex from brands where lower(btrim(name)) = lower(n);
  if ex is not null then return ex; end if;
  insert into brands (name) values (n); return n;
end $$;
create or replace function public.set_product_brand(pid bigint, nm text) returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not public.can_brand() then raise exception 'Not allowed'; end if;
  n := public.add_brand(nm);
  update products set brand = n where id = pid;
  if not found then raise exception 'Product not found'; end if;
end $$;
create or replace function public.rename_brand(old_nm text, new_nm text) returns void language plpgsql security definer set search_path = public as $$
declare n text := btrim(coalesce(new_nm, ''));
begin
  if not public.can_brand() then raise exception 'Not allowed'; end if;
  if n = '' or length(n) > 60 then raise exception 'Enter a brand name (up to 60 characters)'; end if;
  if exists (select 1 from brands where lower(btrim(name)) = lower(n) and lower(btrim(name)) <> lower(btrim(old_nm))) then raise exception 'That brand already exists'; end if;
  update brands set name = n where lower(btrim(name)) = lower(btrim(old_nm));
  update products set brand = n where lower(btrim(brand)) = lower(btrim(old_nm));
end $$;
create or replace function public.delete_brand(nm text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_brand() then raise exception 'Not allowed'; end if;
  update products set brand = '' where lower(btrim(brand)) = lower(btrim(nm));
  delete from brands where lower(btrim(name)) = lower(btrim(nm));
end $$;
revoke all on function public.can_brand(), public.add_brand(text), public.set_product_brand(bigint, text), public.rename_brand(text, text), public.delete_brand(text) from public;
grant execute on function public.can_brand(), public.add_brand(text), public.set_product_brand(bigint, text), public.rename_brand(text, text), public.delete_brand(text) to authenticated;

-- ===== Bags per bundle (inventory) =====
-- Stock is stored in bags. products.bags_per_bundle says how many bags make one bundle (varies per product, e.g. 2-6)
-- so inventory can be shown and counted as "N bundles + M bags".
alter table public.products add column if not exists bags_per_bundle int check (bags_per_bundle is null or bags_per_bundle between 2 and 1000);
update public.products p set bags_per_bundle = (select min(units) from public.product_packs k where k.product_id = p.id) where bags_per_bundle is null;
create or replace function public.set_bags_per_bundle(pid bigint, n int) returns jsonb language plpgsql security definer set search_path = public as $$
declare old int; synced boolean := false;
begin
  if not public.can_brand() then raise exception 'Not allowed'; end if;
  if n is not null and (n < 2 or n > 1000) then raise exception 'Bags per bundle must be between 2 and 1000'; end if;
  select bags_per_bundle into old from products where id = pid; if not found then raise exception 'Product not found'; end if;
  update products set bags_per_bundle = n where id = pid;
  -- keep the selling bundle in step (price per bag stays the same) when it used the old size
  if old is not null and n is not null and old <> n
     and exists (select 1 from product_packs where product_id = pid and units = old)
     and not exists (select 1 from product_packs where product_id = pid and units = n) then
    update product_packs set units = n, label = regexp_replace(label, '^Bundle of ' || old || '(\D|$)', 'Bundle of ' || n || '\1')
      where product_id = pid and units = old;
    synced := true;
  end if;
  return jsonb_build_object('selling_bundle_updated', synced);
end $$;
revoke all on function public.set_bags_per_bundle(bigint, int) from public;
grant execute on function public.set_bags_per_bundle(bigint, int) to authenticated;

-- Bundle size changes also rename auto-named 'Pack of N' labels
CREATE OR REPLACE FUNCTION public.set_bags_per_bundle(pid bigint, n integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare old int; synced boolean := false;
begin
  if not public.can_brand() then raise exception 'Not allowed'; end if;
  if n is not null and (n < 2 or n > 1000) then raise exception 'Bags per bundle must be between 2 and 1000'; end if;
  select bags_per_bundle into old from products where id = pid; if not found then raise exception 'Product not found'; end if;
  update products set bags_per_bundle = n where id = pid;
  -- keep the selling bundle in step (price per bag stays the same) when it used the old size
  if old is not null and n is not null and old <> n
     and exists (select 1 from product_packs where product_id = pid and units = old)
     and not exists (select 1 from product_packs where product_id = pid and units = n) then
    update product_packs set units = n, label = regexp_replace(label, '^(Bundle|Pack) of ' || old || '(\D|$)', '\1 of ' || n || '\2')
      where product_id = pid and units = old;
    synced := true;
  end if;
  return jsonb_build_object('selling_bundle_updated', synced);
end $function$
;

-- ===== More product details =====
alter table public.products add column if not exists sku text not null default '' check (length(sku) <= 60);
alter table public.products add column if not exists barcode text not null default '' check (length(barcode) <= 60);
alter table public.products add column if not exists long_description text not null default '' check (length(long_description) <= 20000);
alter table public.products add column if not exists features jsonb not null default '[]' check (jsonb_typeof(features) = 'array' and jsonb_array_length(features) <= 30);
alter table public.products add column if not exists specs jsonb not null default '[]' check (jsonb_typeof(specs) = 'array' and jsonb_array_length(specs) <= 40);
alter table public.products add column if not exists documents jsonb not null default '[]' check (jsonb_typeof(documents) = 'array' and jsonb_array_length(documents) <= 20);
alter table public.products add column if not exists video_url text not null default '' check (length(video_url) <= 300);
alter table public.products add column if not exists warranty text not null default '' check (length(warranty) <= 500);
create index if not exists products_sku_idx on public.products (lower(sku)) where sku <> '';
-- public bucket for spec sheets / installation guides (PDF etc.), written by catalog staff
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('product-docs', 'product-docs', true, 15728640, array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'])
  on conflict (id) do nothing;
drop policy if exists "staff write product docs" on storage.objects;
create policy "staff write product docs" on storage.objects for insert to authenticated with check (bucket_id = 'product-docs' and public.has_perm('catalog.manage'));
drop policy if exists "staff delete product docs" on storage.objects;
create policy "staff delete product docs" on storage.objects for delete to authenticated using (bucket_id = 'product-docs' and public.has_perm('catalog.manage'));

-- ===== Order history (who changed what, when) =====
create table if not exists public.order_events (
  id bigint generated always as identity primary key, order_id bigint not null references public.orders(id) on delete cascade,
  kind text not null, detail text not null default '', actor text not null default '', created_at timestamptz not null default now());
create index if not exists order_events_idx on public.order_events (order_id, id);
alter table public.order_events enable row level security;
drop policy if exists "staff read order events" on public.order_events;
create policy "staff read order events" on public.order_events for select using (public.has_perm('orders.view'));
create or replace function public.trg_order_events() returns trigger language plpgsql security definer set search_path = public as $$
declare who text := coalesce((select name from profiles where id = auth.uid()), case when auth.uid() is null then 'System' else '' end);
begin
  if tg_op = 'INSERT' then
    insert into order_events (order_id, kind, detail, actor) values (new.id, 'created', case when new.source = 'in_store' then 'In-store sale' else 'Order placed online' end, who);
  else
    if new.status is distinct from old.status then insert into order_events (order_id, kind, detail, actor) values (new.id, 'status', old.status || ' → ' || new.status, who); end if;
    if coalesce(new.tracking_number, '') is distinct from coalesce(old.tracking_number, '') then insert into order_events (order_id, kind, detail, actor) values (new.id, 'tracking', coalesce(nullif(new.tracking_carrier, ''), 'Tracking') || ' ' || coalesce(new.tracking_number, ''), who); end if;
    if coalesce(new.refunded_cents, 0) is distinct from coalesce(old.refunded_cents, 0) then insert into order_events (order_id, kind, detail, actor) values (new.id, 'refund', 'Refunded total now $' || to_char(coalesce(new.refunded_cents, 0) / 100.0, 'FM999990.00'), who); end if;
  end if;
  return null;
end $$;
drop trigger if exists orders_events on public.orders;
create trigger orders_events after insert or update on public.orders for each row execute function public.trg_order_events();
-- backfill one "created" entry for existing orders
insert into public.order_events (order_id, kind, detail, actor, created_at)
  select o.id, 'created', case when o.source = 'in_store' then 'In-store sale' else 'Order placed online' end, '', o.created_at from public.orders o
  where not exists (select 1 from public.order_events e where e.order_id = o.id);

-- ===== Delivery fee by postal code (zones) =====
-- store setting ship_zones = [{label, prefixes:["L4","L5"], fee_cents}]; the longest matching postal-code prefix wins,
-- otherwise the normal flat delivery fee applies.
create or replace function public.ship_fee_for(pc text) returns int language plpgsql stable security definer set search_path = public as $$
declare z jsonb; pre text; n text := upper(regexp_replace(coalesce(pc, ''), '\s', '', 'g')); best int := 0; fee int;
begin
  for z in select * from jsonb_array_elements(coalesce((select value->'ship_zones' from site_settings where key = 'store'), '[]'::jsonb)) loop
    for pre in select upper(regexp_replace(trim(x), '\s', '', 'g')) from jsonb_array_elements_text(coalesce(z->'prefixes', '[]'::jsonb)) x loop
      if pre <> '' and left(n, length(pre)) = pre and length(pre) > best then best := length(pre); fee := greatest(0, coalesce((z->>'fee_cents')::int, 0)); end if;
    end loop;
  end loop;
  return coalesce(fee, public.store_cfg('ship_flat_cents', 1500)::int);
end $$;
grant execute on function public.ship_fee_for(text) to anon, authenticated;

-- place_order: delivery fee comes from the postal-code zones
CREATE OR REPLACE FUNCTION public.place_order(items jsonb, customer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pk record; it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := public.store_cfg('free_over_cents', 50000)::int; flat int := public.store_cfg('ship_flat_cents', 1500)::int;
  rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
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
    sub := sub + public.pack_total(p.id, p.price_cents, q);
  end loop;
  if code is not null then
    pct := public.check_code(code, sub);
    if pct is null then raise exception 'That discount code is not valid'; end if;
    disc := sub * pct / 100;
  end if;
  ship := case when pickup or (free_over > 0 and sub - disc >= free_over) then 0 else public.ship_fee_for(pc) end;
  tax := round((sub - disc + ship) * rate / 100.0)::int;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source, tax_cents, tax_label)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship + tax, disc, code, pref,
          case when pickup then 'pickup' else 'delivery' end, 'online', tax, case when tax > 0 then tlabel else '' end)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    for pk in select * from public.pack_split(p.id, p.price_cents, q) loop
      insert into order_items (order_id, product_id, name, price_cents, qty) values (oid, p.id, p.name || case when pk.label <> '' then ' (' || pk.label || ' price)' else '' end, pk.price, pk.qty) returning id into item_id;
      perform public.allocate_stock(item_id, p.id, pk.qty, pref, pickup, oid);
    end loop;
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $function$
;

-- ===== More SEO tools: focus keywords + redirects =====
alter table public.products add column if not exists focus_keyword text not null default '' check (length(focus_keyword) <= 80);
alter table public.pages add column if not exists focus_keyword text not null default '' check (length(focus_keyword) <= 80);
create table if not exists public.seo_redirects (
  id bigint generated always as identity primary key,
  from_path text not null unique check (from_path ~ '^/[^\s?#]*$' and length(from_path) <= 200),
  to_path text not null check (length(to_path) between 1 and 300),
  permanent boolean not null default true, note text not null default '', created_at timestamptz not null default now());
alter table public.seo_redirects enable row level security;
drop policy if exists "read redirects" on public.seo_redirects;
create policy "read redirects" on public.seo_redirects for select using (true);
drop policy if exists "staff redirects" on public.seo_redirects;
create policy "staff redirects" on public.seo_redirects for all using (public.has_perm('content.manage')) with check (public.has_perm('content.manage'));

-- ===== Show bundles as bundles on orders =====
alter table public.order_items add column if not exists pack_units int;      -- set on bundle-priced lines: bags per bundle
alter table public.order_items add column if not exists bundle_size int;     -- bags per bundle for this product at order time
drop function if exists public.pack_total(bigint, int, int);
drop function if exists public.pack_split(bigint, int, int);
create or replace function public.pack_split(pid bigint, base int, q int) returns table(qty int, price int, label text, units int)
language plpgsql stable security definer set search_path = public as $$
declare r record; n int; rest int := q;
begin
  for r in select * from product_packs where product_id = pid and unit_price_cents < base order by product_packs.units desc loop
    n := rest / r.units;
    if n > 0 then qty := n * r.units; price := r.unit_price_cents; label := r.label; units := r.units; return next; rest := rest - qty; end if;
  end loop;
  if rest > 0 then qty := rest; price := base; label := ''; units := null; return next; end if;
end $$;
create or replace function public.pack_total(pid bigint, base int, q int) returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty * price), 0)::int from public.pack_split(pid, base, q) $$;
grant execute on function public.pack_split(bigint, int, int), public.pack_total(bigint, int, int) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.place_order(items jsonb, customer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pk record; it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := public.store_cfg('free_over_cents', 50000)::int; flat int := public.store_cfg('ship_flat_cents', 1500)::int;
  rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
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
    sub := sub + public.pack_total(p.id, p.price_cents, q);
  end loop;
  if code is not null then
    pct := public.check_code(code, sub);
    if pct is null then raise exception 'That discount code is not valid'; end if;
    disc := sub * pct / 100;
  end if;
  ship := case when pickup or (free_over > 0 and sub - disc >= free_over) then 0 else public.ship_fee_for(pc) end;
  tax := round((sub - disc + ship) * rate / 100.0)::int;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source, tax_cents, tax_label)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship + tax, disc, code, pref,
          case when pickup then 'pickup' else 'delivery' end, 'online', tax, case when tax > 0 then tlabel else '' end)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    for pk in select * from public.pack_split(p.id, p.price_cents, q) loop
      insert into order_items (order_id, product_id, name, price_cents, qty, pack_units, bundle_size) values (oid, p.id, p.name || case when pk.label <> '' then ' (' || pk.label || ' price)' else '' end, pk.price, pk.qty, pk.units, coalesce(p.bags_per_bundle, (select min(k.units) from product_packs k where k.product_id = p.id))) returning id into item_id;
      perform public.allocate_stock(item_id, p.id, pk.qty, pref, pickup, oid);
    end loop;
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $function$
;

CREATE OR REPLACE FUNCTION public.record_sale(loc_id bigint, items jsonb, customer jsonb, payment text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pk record; it jsonb; p public.products; q int; sub int := 0; oid bigint; item_id bigint; loc public.locations; rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
begin
  if not public.has_perm('pos') then raise exception 'Not allowed'; end if;
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
    for pk in select * from public.pack_split(p.id, p.price_cents, q) loop
      insert into order_items (order_id, product_id, name, price_cents, qty, pack_units, bundle_size) values (oid, p.id, p.name || case when pk.label <> '' then ' (' || pk.label || ' price)' else '' end, pk.price, pk.qty, pk.units, coalesce(p.bags_per_bundle, (select min(k.units) from product_packs k where k.product_id = p.id))) returning id into item_id;
      begin perform public.allocate_stock(item_id, p.id, pk.qty, loc.id, true, oid);
      exception when others then raise exception 'Not enough stock of % at %', p.name, loc.name; end;
    end loop;
    sub := sub + public.pack_total(p.id, p.price_cents, q);
  end loop;
  tax := round(sub * rate / 100.0)::int;
  update orders set subtotal_cents = sub, tax_cents = tax, tax_label = case when tax > 0 then tlabel else '' end, total_cents = sub + tax where id = oid;
  return oid;
end $function$
;

-- ===== Anti-spam & abandoned carts =====
create table if not exists public.rate_limits (k text not null, bucket timestamptz not null, n int not null default 0, primary key (k, bucket));
alter table public.rate_limits enable row level security;
create table if not exists public.spam_log (id bigint generated always as identity primary key, kind text not null, detail text not null default '', ip_hash text not null default '', created_at timestamptz not null default now());
create index if not exists spam_log_idx on public.spam_log (created_at desc);
alter table public.spam_log enable row level security;
drop policy if exists "staff read spam log" on public.spam_log;
create policy "staff read spam log" on public.spam_log for select using (public.has_perm('team.manage'));
create table if not exists public.blocked_email_domains (domain text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+$'));
alter table public.blocked_email_domains enable row level security;
drop policy if exists "staff blocked domains" on public.blocked_email_domains;
create policy "staff blocked domains" on public.blocked_email_domains for all using (public.has_perm('team.manage')) with check (public.has_perm('team.manage'));
insert into public.blocked_email_domains (domain) values ('mailinator.com'),('guerrillamail.com'),('guerrillamail.net'),('guerrillamail.org'),('sharklasers.com'),('grr.la'),('10minutemail.com'),('10minutemail.net'),('tempmail.com'),('temp-mail.org'),('temp-mail.io'),('tempmailo.com'),('tempail.com'),('yopmail.com'),('yopmail.net'),('trashmail.com'),('trashmail.net'),('throwawaymail.com'),('getnada.com'),('nada.email'),('maildrop.cc'),('dispostable.com'),('fakeinbox.com'),('mintemail.com'),('mohmal.com'),('emailondeck.com'),('moakt.com'),('mailnesia.com'),('spamgourmet.com'),('burnermail.io'),('discard.email'),('mailcatch.com'),('inboxkitten.com'),('mytemp.email'),('tmpmail.org'),('tmpmail.net'),('minuteinbox.com'),('anonbox.net'),('luxusmail.org'),('byom.de'),('trbvm.com'),('wegwerfmail.de'),('einrot.com'),('cuvox.de'),('dayrep.com'),('armyspy.com'),('rhyta.com'),('superrito.com'),('teleworm.us'),('jourrapide.com'),('gustr.com'),('fleckens.hu') on conflict do nothing;

create or replace function public.client_ip() returns text language sql stable as $$
  select nullif(btrim(split_part(coalesce((nullif(current_setting('request.headers', true), ''))::jsonb ->> 'x-forwarded-for', ''), ',', 1)), '') $$;
create or replace function public.link_count(t text) returns int language sql immutable as $$
  select greatest(coalesce(array_length(regexp_split_to_array(coalesce(t, ''), '(https?://|www\.)'), 1), 1) - 1, 0) $$;
create or replace function public.rate_check(kind text, max_n int, win interval) returns void language plpgsql security definer set search_path = public as $$
declare key text := kind || ':' || md5(coalesce(public.client_ip(), '?') || ':' || coalesce(auth.uid()::text, '')); b timestamptz := date_bin(win, now(), timestamptz 'epoch'); c int;
begin
  if auth.uid() is not null and public.has_perm('orders.view') then return; end if;  -- staff are never throttled
  insert into rate_limits (k, bucket, n) values (key, b, 1) on conflict (k, bucket) do update set n = rate_limits.n + 1 returning n into c;
  if c > max_n then raise exception 'Too many attempts. Please wait a few minutes and try again.'; end if;
  if random() < 0.01 then delete from rate_limits where bucket < now() - interval '2 days'; end if;
end $$;
create or replace function public.trg_rate() returns trigger language plpgsql security definer set search_path = public as $$
begin perform public.rate_check(tg_argv[0], tg_argv[1]::int, (tg_argv[2] || ' seconds')::interval); return new; end $$;
create or replace function public.trg_links_guard() returns trigger language plpgsql as $$
declare t text := case tg_argv[0] when 'quote' then new.message when 'review' then new.comment else '' end;
begin if public.link_count(t) > tg_argv[1]::int then raise exception 'Please remove some of the links from your message and try again.'; end if; return new; end $$;
drop trigger if exists quotes_rate on public.quotes; create trigger quotes_rate before insert on public.quotes for each row execute function public.trg_rate('quote', '5', '3600');
drop trigger if exists quotes_links on public.quotes; create trigger quotes_links before insert on public.quotes for each row execute function public.trg_links_guard('quote', '3');
drop trigger if exists reviews_rate on public.reviews; create trigger reviews_rate before insert on public.reviews for each row execute function public.trg_rate('review', '6', '3600');
drop trigger if exists reviews_links on public.reviews; create trigger reviews_links before insert on public.reviews for each row execute function public.trg_links_guard('review', '2');
drop trigger if exists messages_rate on public.messages; create trigger messages_rate before insert on public.messages for each row execute function public.trg_rate('msg', '40', '300');

-- sign-ups: no disposable-email domains, no link-stuffed names, and a global flood brake
create or replace function public.trg_block_spam_signup() returns trigger language plpgsql security definer set search_path = public, auth as $$
declare d text := lower(split_part(coalesce(new.email, ''), '@', 2)); nm text := coalesce(new.raw_user_meta_data->>'name', '');
begin
  if exists (select 1 from public.blocked_email_domains b where d = b.domain or d like '%.' || b.domain) then raise exception 'Please use a permanent email address (temporary email services are not allowed).'; end if;
  if nm ~* '(https?://|www\.)' or length(nm) > 80 then raise exception 'That name is not allowed.'; end if;
  if (select count(*) from auth.users where created_at > now() - interval '10 minutes') >= 40 then raise exception 'Sign-ups are busy right now. Please try again in a few minutes.'; end if;
  return new;
end $$;
drop trigger if exists block_spam_signup on auth.users;
create trigger block_spam_signup before insert on auth.users for each row execute function public.trg_block_spam_signup();

-- review recent accounts for the admin Spam page, and remove obvious junk (never accounts that have orders)
create or replace function public.spam_review() returns table(id uuid, name text, email text, username text, created_at timestamptz, confirmed boolean, orders bigint, flags text[])
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.has_perm('team.manage') then raise exception 'Not allowed'; end if;
  return query
  select u.id, coalesce(p.name, ''), u.email::text, coalesce(p.username, ''), u.created_at, u.email_confirmed_at is not null,
    (select count(*) from orders o where o.user_id = u.id),
    array_remove(array[
      case when exists (select 1 from blocked_email_domains b where split_part(lower(u.email), '@', 2) = b.domain) then 'disposable email' end,
      case when u.email_confirmed_at is null and u.created_at < now() - interval '1 day' then 'never confirmed' end,
      case when coalesce(p.name, '') ~* '(https?://|www\.)' then 'link in name' end,
      case when u.email ~ '[0-9]{6,}@' then 'numeric email' end], null)
  from auth.users u left join profiles p on p.id = u.id
  where coalesce(p.role, 'customer') = 'customer'
  order by u.created_at desc limit 150;
end $$;
create or replace function public.delete_spam_users(ids uuid[]) returns int language plpgsql security definer set search_path = public, auth as $$
declare n int;
begin
  if not public.has_perm('team.manage') then raise exception 'Not allowed'; end if;
  delete from auth.users u where u.id = any(ids) and not exists (select 1 from orders o where o.user_id = u.id) and not exists (select 1 from profiles p where p.id = u.id and p.role <> 'customer');
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.spam_review(), public.delete_spam_users(uuid[]), public.rate_check(text, int, interval) from public;
grant execute on function public.spam_review(), public.delete_spam_users(uuid[]) to authenticated;
grant execute on function public.rate_check(text, int, interval) to anon, authenticated;

-- ===== Abandoned carts =====
create table if not exists public.carts (
  id bigint generated always as identity primary key, session_key uuid not null unique, user_id uuid references auth.users(id) on delete set null,
  email text not null default '', name text not null default '', phone text not null default '',
  items jsonb not null default '[]', total_cents int not null default 0, item_count int not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  notified boolean not null default false, recovered boolean not null default false, handled boolean not null default false);
create index if not exists carts_updated_idx on public.carts (updated_at desc);
alter table public.carts enable row level security;
drop policy if exists "staff read carts" on public.carts; create policy "staff read carts" on public.carts for select using (public.has_perm('orders.view'));
drop policy if exists "staff edit carts" on public.carts; create policy "staff edit carts" on public.carts for update using (public.has_perm('orders.manage')) with check (public.has_perm('orders.manage'));
drop policy if exists "staff delete carts" on public.carts; create policy "staff delete carts" on public.carts for delete using (public.has_perm('orders.manage'));
create or replace function public.save_cart(skey uuid, items jsonb, contact jsonb default '{}') returns void language plpgsql security definer set search_path = public as $$
declare lines jsonb; tot int; cnt int; em text; nm text; ph text;
begin
  perform public.rate_check('cart', 120, interval '1 hour');
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 60 then return; end if;
  select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'qty', q.qty, 'line_cents', public.pack_total(p.id, p.price_cents, q.qty))), coalesce(sum(public.pack_total(p.id, p.price_cents, q.qty)), 0), coalesce(sum(q.qty), 0)
    into lines, tot, cnt
  from (select (e->>'id')::bigint as id, least(greatest((e->>'qty')::int, 1), 5000) as qty from jsonb_array_elements(items) e where (e->>'id') ~ '^[0-9]+$' and (e->>'qty') ~ '^[0-9]+$') q
  join products p on p.id = q.id and p.active;
  em := lower(btrim(coalesce(nullif(contact->>'email', ''), (select email from profiles where id = auth.uid()), '')));
  if lines is null then delete from carts where session_key = skey and not recovered; return; end if;
  if em = '' and auth.uid() is null then return; end if;   -- nobody we could contact: don't keep it
  if length(em) > 200 or (em <> '' and em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then em := ''; end if;
  nm := left(coalesce(nullif(contact->>'name', ''), (select name from profiles where id = auth.uid()), ''), 120); ph := left(coalesce(contact->>'phone', ''), 40);
  insert into carts (session_key, user_id, email, name, phone, items, total_cents, item_count) values (skey, auth.uid(), em, nm, ph, lines, tot, cnt)
  on conflict (session_key) do update set user_id = coalesce(excluded.user_id, carts.user_id), email = coalesce(nullif(excluded.email, ''), carts.email), name = coalesce(nullif(excluded.name, ''), carts.name), phone = coalesce(nullif(excluded.phone, ''), carts.phone),
    notified = case when carts.items is distinct from excluded.items then false else carts.notified end, handled = case when carts.items is distinct from excluded.items then false else carts.handled end,
    items = excluded.items, total_cents = excluded.total_cents, item_count = excluded.item_count, updated_at = now(), recovered = false;
end $$;
create or replace function public.clear_cart(skey uuid) returns void language plpgsql security definer set search_path = public as $$
begin perform public.rate_check('cartclear', 120, interval '1 hour'); delete from carts where session_key = skey and not recovered; end $$;
grant execute on function public.save_cart(uuid, jsonb, jsonb), public.clear_cart(uuid) to anon, authenticated;
create or replace function public.trg_cart_recovered() returns trigger language plpgsql security definer set search_path = public as $$
begin update carts set recovered = true where (new.user_id is not null and user_id = new.user_id) or (email <> '' and lower(email) = lower(coalesce(new.email, ''))); return null; end $$;
drop trigger if exists orders_cart_recovered on public.orders; create trigger orders_cart_recovered after insert on public.orders for each row execute function public.trg_cart_recovered();
create or replace function public.notify_abandoned_carts() returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select * from carts where not notified and not recovered and not handled and item_count > 0 and updated_at < now() - interval '2 hours' loop
    insert into notifications (user_id, kind, title, body, link)
      select pr.id, 'cart', 'Abandoned cart: ' || coalesce(nullif(r.name, ''), r.email, 'a customer'), r.item_count || ' item' || case when r.item_count = 1 then '' else 's' end || ' worth $' || to_char(r.total_cents / 100.0, 'FM999990.00') || ' were left in the cart', '#/admin/carts'
      from profiles pr where public.user_has_perm(pr.id, 'orders.view');
    update carts set notified = true where id = r.id; n := n + 1;
  end loop;
  delete from carts where updated_at < now() - interval '60 days';
  return n;
end $$;

select cron.schedule('abandoned-carts', '*/30 * * * *', 'select public.notify_abandoned_carts()');

CREATE OR REPLACE FUNCTION public.place_order(items jsonb, customer jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare pk record; it jsonb; p public.products; q int; sub int := 0; ship int; oid bigint; gk uuid; item_id bigint;
  disc int := 0; pct int; code text := nullif(upper(trim(coalesce(customer->>'code',''))), '');
  free_over int := public.store_cfg('free_over_cents', 50000)::int; flat int := public.store_cfg('ship_flat_cents', 1500)::int;
  rate numeric := public.store_cfg('tax_rate', 0); tax int; tlabel text := public.store_cfg_text('tax_label', 'Tax');
  pickup boolean := coalesce(customer->>'fulfillment', 'delivery') = 'pickup'; loc public.locations; pref bigint;
  addr text; city text; pc text; avail int;
begin
  perform public.rate_check('order', 8, interval '1 hour');
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
    sub := sub + public.pack_total(p.id, p.price_cents, q);
  end loop;
  if code is not null then
    pct := public.check_code(code, sub);
    if pct is null then raise exception 'That discount code is not valid'; end if;
    disc := sub * pct / 100;
  end if;
  ship := case when pickup or (free_over > 0 and sub - disc >= free_over) then 0 else public.ship_fee_for(pc) end;
  tax := round((sub - disc + ship) * rate / 100.0)::int;
  insert into orders (user_id, email, name, phone, address, city, postcode, notes, subtotal_cents, shipping_cents, total_cents, discount_cents, promo_code, location_id, fulfillment, source, tax_cents, tax_label)
  values (auth.uid(), customer->>'email', customer->>'name', coalesce(customer->>'phone',''), addr, city, pc, coalesce(customer->>'notes',''), sub, ship, sub - disc + ship + tax, disc, code, pref,
          case when pickup then 'pickup' else 'delivery' end, 'online', tax, case when tax > 0 then tlabel else '' end)
  returning id, guest_key into oid, gk;
  for it in select * from jsonb_array_elements(items) loop
    q := (it->>'qty')::int;
    select * into p from products where id = (it->>'id')::bigint;
    for pk in select * from public.pack_split(p.id, p.price_cents, q) loop
      insert into order_items (order_id, product_id, name, price_cents, qty, pack_units, bundle_size) values (oid, p.id, p.name || case when pk.label <> '' then ' (' || pk.label || ' price)' else '' end, pk.price, pk.qty, pk.units, coalesce(p.bags_per_bundle, (select min(k.units) from product_packs k where k.product_id = p.id))) returning id into item_id;
      perform public.allocate_stock(item_id, p.id, pk.qty, pref, pickup, oid);
    end loop;
  end loop;
  return jsonb_build_object('id', oid, 'key', gk);
end $function$
;

CREATE OR REPLACE FUNCTION public.submit_form(form_slug text, answers jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare f public.forms; fld jsonb; v jsonb; txt text; k text; clean jsonb := '{}'; ftype text; item text; st jsonb; lim numeric;
begin
  perform public.rate_check('form:' || form_slug, 12, interval '1 hour');
  if coalesce(answers->>'_hp', '') <> '' or ((answers->>'_t') ~ '^[0-9]+$' and extract(epoch from now()) * 1000 - (answers->>'_t')::numeric < 2500) or public.link_count(answers::text) > 4 then
    insert into spam_log (kind, detail, ip_hash) values ('form', 'blocked submission to ' || form_slug, md5(coalesce(public.client_ip(), '?')));
    return;   -- looks like a bot: pretend it worked, store nothing
  end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_when_back(pid bigint, addr text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.rate_check('alert', 10, interval '1 hour');
  addr := lower(trim(addr));
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address'; end if;
  if not exists (select 1 from products where id = pid and active) then raise exception 'Product not found'; end if;
  insert into stock_alerts (product_id, email) values (pid, addr) on conflict do nothing;
end $function$
;

-- ===== Page editor v3: cover image, subtitle, layout width, scheduled publishing =====
alter table public.pages add column if not exists cover_url text not null default '' check (length(cover_url) <= 500);
alter table public.pages add column if not exists subtitle text not null default '' check (length(subtitle) <= 200);
alter table public.pages add column if not exists layout text not null default 'narrow' check (layout in ('narrow', 'wide', 'full'));
alter table public.pages add column if not exists publish_at timestamptz;
alter table public.pages add column if not exists unpublish_at timestamptz;
drop policy if exists "view pages" on public.pages;
create policy "view pages" on public.pages for select using (
  (published and (publish_at is null or publish_at <= now()) and (unpublish_at is null or unpublish_at > now())) or public.is_admin());

-- ===== Reviews v2: verified purchases, store replies, moderation =====
alter table public.reviews add column if not exists verified boolean not null default false;
alter table public.reviews add column if not exists hidden boolean not null default false;
alter table public.reviews add column if not exists reply text not null default '' check (length(reply) <= 1000);
alter table public.reviews add column if not exists replied_at timestamptz;
update public.reviews r set verified = exists (select 1 from order_items oi join orders o on o.id = oi.order_id where oi.product_id = r.product_id and o.user_id = r.user_id and o.status <> 'cancelled') where not verified;
create or replace function public.trg_review_verify() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.verified := exists (select 1 from order_items oi join orders o on o.id = oi.order_id where oi.product_id = new.product_id and o.user_id = new.user_id and o.status <> 'cancelled');
  new.hidden := false; new.reply := ''; new.replied_at := null;
  return new;
end $$;
drop trigger if exists reviews_verify on public.reviews;
create trigger reviews_verify before insert on public.reviews for each row execute function public.trg_review_verify();
drop policy if exists "read reviews" on public.reviews;
create policy "read reviews" on public.reviews for select using (not hidden or user_id = auth.uid() or public.has_perm('content.manage'));
drop policy if exists "staff moderate reviews" on public.reviews;
create policy "staff moderate reviews" on public.reviews for update using (public.has_perm('content.manage')) with check (public.has_perm('content.manage'));
-- customers also see invoices addressed to their (confirmed) email, not only ones linked to their account
drop policy if exists "view invoices" on public.invoices;
create policy "view invoices" on public.invoices for select using (public.has_perm('invoices.view') or (status <> 'draft' and (customer_id = auth.uid() or (customer_email <> '' and lower(customer_email) = lower(coalesce(auth.jwt() ->> 'email', ''))))));

-- fix: the link guard must read the right column for each table (it referenced a column that does not exist on the other table)
create or replace function public.trg_links_guard() returns trigger language plpgsql as $$
declare t text := coalesce(to_jsonb(new) ->> (tg_argv[2]), '');
begin if public.link_count(t) > tg_argv[1]::int then raise exception 'Please remove some of the links from your message and try again.'; end if; return new; end $$;
drop trigger if exists quotes_links on public.quotes; create trigger quotes_links before insert on public.quotes for each row execute function public.trg_links_guard('quote', '3', 'message');
drop trigger if exists reviews_links on public.reviews; create trigger reviews_links before insert on public.reviews for each row execute function public.trg_links_guard('review', '2', 'comment');

-- hidden reviews don't count towards the star rating
create or replace view public.product_ratings as
  select product_id, (round(avg(rating), 1))::double precision as avg, (count(*))::integer as count from public.reviews where not hidden group by product_id;
