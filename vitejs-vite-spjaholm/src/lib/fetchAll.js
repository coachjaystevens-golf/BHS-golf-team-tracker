// Supabase returns at most 1,000 rows per request (the project's "Max rows"
// API setting). A full season of hole-by-hole scores passes that quickly
// (Beech's 2026 season is already ~1,200 rows), so season-wide queries
// must page through the results or they silently drop holes.
//
// Usage — pass a function that builds a FRESH query each time:
//   const { data, error } = await fetchAll(() =>
//     supabase.from('scores').select('...').eq('rounds.season_id', seasonId));
//
// The table being queried must have an `id` column (used for stable paging).

const PAGE = 1000;

export async function fetchAll(build) {
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build()
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { data: all, error: null };
}
