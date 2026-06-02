import { Team, User } from '../types';

export const DEMO_LEGACY_TO_SUPABASE_USER_ID: Record<string, string> = {
    'user-1': '00000000-0000-4000-8000-000000000001',
    'user-2': '00000000-0000-4000-8000-000000000002',
    'user-3': '00000000-0000-4000-8000-000000000003',
    'user-4': '00000000-0000-4000-8000-000000000004',
    'user-5': '00000000-0000-4000-8000-000000000005',
    'user-6': '00000000-0000-4000-8000-000000000006',
    'user-7': '00000000-0000-4000-8000-000000000007',
    'user-8': '00000000-0000-4000-8000-000000000008',
    'user-9': '00000000-0000-4000-8000-000000000009',
};

export const toSupabaseDemoUserId = (userId?: string) => {
    if (!userId) return userId;
    return DEMO_LEGACY_TO_SUPABASE_USER_ID[userId] || userId;
};

export const mapDemoUsersForSupabase = (users: User[]): User[] => users.map(user => ({
    ...user,
    id: toSupabaseDemoUserId(user.id) || user.id,
}));

export const mapDemoTeamsForSupabase = (teams: Team[]): Team[] => teams.map(team => ({
    ...team,
    memberIds: team.memberIds.map(memberId => toSupabaseDemoUserId(memberId) || memberId),
}));
