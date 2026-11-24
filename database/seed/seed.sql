-- Seed data for AI Study & Safety Coach
-- Default demo parent and student (password: Password123! or password123)

INSERT INTO users (id, role, name, email, password_hash, created_at, updated_at)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'PARENT', 'Sarah Jenkins (Parent)', 'parent@example.com', '$2a$10$vj5svK3L300D2thHUZ0LEeNoEMTimKQWi5hzq5qyqLHrvkefsOJxW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('22222222-2222-2222-2222-222222222222', 'STUDENT', 'Alex Jenkins (Student)', 'student@example.com', '$2a$10$vj5svK3L300D2thHUZ0LEeNoEMTimKQWi5hzq5qyqLHrvkefsOJxW', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash;

INSERT INTO parent_student_links (id, parent_id, student_id, status, created_at)
VALUES
    ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'ACTIVE', CURRENT_TIMESTAMP)
ON CONFLICT (parent_id, student_id) DO NOTHING;

INSERT INTO devices (id, student_id, device_name, platform, status, last_heartbeat, protection_enabled, created_at, updated_at)
VALUES
    ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'Alex-Surface-Laptop', 'Windows', 'ONLINE', CURRENT_TIMESTAMP, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
