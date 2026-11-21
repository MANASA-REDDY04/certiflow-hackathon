-- 20260101000001_seed_data.sql
-- CertiFlow Seed Data

-- 1. Districts
INSERT INTO districts (id, name, code)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Central District', 'DIST-CENTRAL-01')
ON CONFLICT (code) DO NOTHING;

-- 2. Training Centres
INSERT INTO centres (id, name, code, district_id)
VALUES 
    ('22222222-2222-2222-2222-222222222222', 'Apex Skills Training Centre', 'TC-APEX-01', '11111111-1111-1111-1111-111111111111')
ON CONFLICT (code) DO NOTHING;

-- 3. Users (switchable from login screen, no passwords needed)
-- Anika (training centre)
-- Dev, Meera, Kabir (district officers, same district)
-- Neha (quality team)
-- Farah (state office)
INSERT INTO users (id, name, email, role, district_id, centre_id)
VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'Anika',
        'anika@certiflow.local',
        'training_centre',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222'
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        'Dev',
        'dev@certiflow.local',
        'district_officer',
        '11111111-1111-1111-1111-111111111111',
        NULL
    ),
    (
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        'Meera',
        'meera@certiflow.local',
        'district_officer',
        '11111111-1111-1111-1111-111111111111',
        NULL
    ),
    (
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        'Kabir',
        'kabir@certiflow.local',
        'district_officer',
        '11111111-1111-1111-1111-111111111111',
        NULL
    ),
    (
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        'Neha',
        'neha@certiflow.local',
        'quality_team',
        NULL,
        NULL
    ),
    (
        'ffffffff-ffff-ffff-ffff-ffffffffffff',
        'Farah',
        'farah@certiflow.local',
        'state_office',
        NULL,
        NULL
    )
ON CONFLICT (email) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    district_id = EXCLUDED.district_id,
    centre_id = EXCLUDED.centre_id;
