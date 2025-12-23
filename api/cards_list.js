import { j, sql, requireEnv, supabase } from "./_lib.js";

export default async function handler(req, res) {
  try {
    requireEnv("NEON_DATABASE_URL");
    requireEnv("SUPABASE_BUCKET");
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const url = new URL(req.url, `http://${req.headers.host}`);
    const sort = (url.searchParams.get("sort") || "trending").toLowerCase();
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 100);

    let rows;

    if (sort === "newest") {
      rows = await sql`
        select id, owner_wallet, name, image_url, created_at, upvotes, downvotes,
               (upvotes - downvotes) as score
        from com_cards
        order by created_at desc
        limit ${limit}
      `;
    } else if (sort === "top") {
      rows = await sql`
        select id, owner_wallet, name, image_url, created_at, upvotes, downvotes,
               (upvotes - downvotes) as score
        from com_cards
        order by (upvotes - downvotes) desc, upvotes desc, created_at desc
        limit ${limit}
      `;
    } else {
      rows = await sql`
        select id, owner_wallet, name, image_url, created_at, upvotes, downvotes,
               (upvotes - downvotes) as score,
               ((upvotes - downvotes)::float / power((extract(epoch from (now() - created_at)) / 3600.0 + 2.0), 1.5)) as trend
        from com_cards
        order by trend desc nulls last, created_at desc
        limit ${limit}
      `;
    }

    const bucket = process.env.SUPABASE_BUCKET;

    // ✅ Sign each path (stored in image_url)
    const items = [];
    for (const r of rows) {
      const path = r.image_url;
      const { data: signed, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, 60 * 60); // 1 hour

      if (signErr) {
        // If signing fails, still return item but with null image
        items.push({ ...r, image_url: null, imageUrl: null });
      } else {
        items.push({ ...r, imageUrl: signed.signedUrl });
      }
    }

    return j(res, 200, { ok: true, sort, items });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
