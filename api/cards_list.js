import { j, sql } from "./_lib.js";

export default async function handler(req, res) {
  try {
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
      // trending: score / (hours_since + 2)^1.5
      rows = await sql`
        select id, owner_wallet, name, image_url, created_at, upvotes, downvotes,
               (upvotes - downvotes) as score,
               ((upvotes - downvotes)::float / power((extract(epoch from (now() - created_at)) / 3600.0 + 2.0), 1.5)) as trend
        from com_cards
        order by trend desc nulls last, created_at desc
        limit ${limit}
      `;
    }

    return j(res, 200, { ok: true, sort, items: rows });
  } catch (e) {
    return j(res, 500, { error: String(e?.message || e) });
  }
}
