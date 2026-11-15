-- Run AFTER the coach has signed up in the app once.
-- Replace the email and name, then Run. This is what makes an account a coach.

insert into public.profiles (id, role, full_name)
select id, 'coach', 'Coach Name'
from auth.users
where email = 'coach@example.com'
on conflict (id) do update set role = 'coach';
