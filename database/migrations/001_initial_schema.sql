-- AI Study & Safety Coach Database Schema
-- Compatible with PostgreSQL 13+ and PGlite

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    role VARCHAR(20) NOT NULL CHECK (role IN ('PARENT', 'STUDENT')),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    platform VARCHAR(50) DEFAULT 'Windows',
    status VARCHAR(20) DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE')),
    last_heartbeat TIMESTAMP WITH TIME ZONE,
    protection_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_devices_student ON devices(student_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

CREATE TABLE IF NOT EXISTS parent_student_links (
    id UUID PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(parent_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_links_parent ON parent_student_links(parent_id);
CREATE INDEX IF NOT EXISTS idx_links_student ON parent_student_links(student_id);

CREATE TABLE IF NOT EXISTS pairing_codes (
    id UUID PRIMARY KEY,
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pairing_codes_parent ON pairing_codes(parent_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON pairing_codes(expires_at);

CREATE TABLE IF NOT EXISTS study_sessions (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    task_text TEXT NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
    focus_score NUMERIC(5, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_student ON study_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON study_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON study_sessions(status);

CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    app_name VARCHAR(255),
    process_name VARCHAR(255),
    window_title TEXT,
    idle_seconds INTEGER DEFAULT 0,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_session ON activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON activity_events(timestamp);

CREATE TABLE IF NOT EXISTS context_captures (
    id UUID PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    activity_event_id UUID REFERENCES activity_events(id) ON DELETE SET NULL,
    storage_ref TEXT NOT NULL,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    retention_expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_captures_session ON context_captures(session_id);

CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY,
    activity_event_id UUID NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL CHECK (category IN ('RELEVANT', 'DISTRACTED', 'POTENTIALLY_HARMFUL', 'UNCERTAIN', 'AI_ERROR')),
    confidence NUMERIC(4, 3) NOT NULL,
    task_relevance NUMERIC(4, 3) NOT NULL,
    risk_level VARCHAR(20) NOT NULL CHECK (risk_level IN ('NONE', 'LOW', 'MEDIUM', 'HIGH')),
    reason TEXT NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    latency_ms INTEGER DEFAULT 0,
    raw_response_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_event ON ai_analyses(activity_event_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_category ON ai_analyses(category);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    related_event_id UUID REFERENCES activity_events(id) ON DELETE SET NULL,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read_at);

CREATE TABLE IF NOT EXISTS study_reports (
    id UUID PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    focus_score NUMERIC(5, 2) NOT NULL,
    productive_minutes NUMERIC(8, 2) DEFAULT 0,
    distraction_minutes NUMERIC(8, 2) DEFAULT 0,
    idle_minutes NUMERIC(8, 2) DEFAULT 0,
    summary_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reports_student ON study_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_reports_parent ON study_reports(parent_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata_json JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_by_role VARCHAR(20) NOT NULL CHECK (created_by_role IN ('PARENT', 'STUDENT')),
    title VARCHAR(500) NOT NULL,
    description TEXT DEFAULT '',
    subject VARCHAR(100) DEFAULT 'General',
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'IN_PROGRESS', 'COMPLETED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_student ON tasks(student_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
