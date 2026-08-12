-- Per-user alert channel prefs. Default TRUE so existing users keep getting
-- alerts until they opt out. Apply to project cpudfwfepexswgmqdbnm.
alter table users add column if not exists email_notifications boolean not null default true;
alter table users add column if not exists push_notifications  boolean not null default true;
