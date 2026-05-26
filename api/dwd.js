const BASE = 'https://www.dwd.de/DE/wetter/warnungen_aktuell/warnlagebericht/';

const REGION_PATHS = {
    DWOG: 'berlin_brandenburg/warnlage_bb_node.html',
    DWEG: 'berlin_brandenburg/warnlage_bb_node.html',
    DWHG: 'schleswig_holstein_hamburg/warnlage_shh_node.html',
    DWHH: 'schleswig_holstein_hamburg/warnlage_shh_node.html',
    DWLG: 'niedersachsen_bremen/warnlage_nds_node.html',
    DWLH: 'nordrhein_westfalen/warnlage_nrw_node.html',
    DWLI: 'hessen/warnlage_hes_node.html',
    DWPH: 'rheinland-pfalz_saarland/warnlage_rps_node.html',
    DWEH: 'sachen_anhalt/warnlage_saa_node.html',
    DWEI: 'thueringen/warnlage_thu_node.html',
    DWPG: 'sachsen/warnlage_sac_node.html',
    DWMO: 'nordbayern/warnlage_nordbay_node.html',
    DWMP: 'baden-wuerttemberg/warnlage_baw_node.html',
};

function extractText(html) {
    // Zoek de main content sectie — DWD gooit navigatie etc. erbij
    // Focus op <h2>, <h3> en <p> binnen de artikelinhoud
    const contentMatch = html.match(/<div[^>]*class="[^"]*c-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
        || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);

    const source = contentMatch ? contentMatch[1] : html;

    // Verwijder script/style blokken
    const stripped = source
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');

    // Extraheer h2, h3 en p teksten
    const blocks = [];
    const tagPat = /<(h2|h3|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let match;
    while ((match = tagPat.exec(stripped)) !== null) {
        const tag = match[1].toLowerCase();
        const inner = match[2]
            .replace(/<[^>]+>/g, ' ')  // strip inner tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ')
            .replace(/&#\d+;/g, '')
            .replace(/&[a-z]+;/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!inner || inner.length < 10) continue;
        // Skip navigatie-achtige korte labels
        if (tag === 'p' && inner.length < 20) continue;
        blocks.push(tag === 'p' ? inner : `**${inner}**`);
    }

    return blocks.join('\n\n');
}

export default async function handler(req, res) {
    const { code } = req.query;
    if (!code || !/^DW[A-Z]{2}$/.test(code)) {
        return res.status(400).json({ error: 'invalid code' });
    }

    const path = REGION_PATHS[code];
    if (!path) {
        return res.status(404).json({ error: 'unknown region' });
    }

    try {
        const pageRes = await fetch(`${BASE}${path}`, {
            headers: { 'Accept-Language': 'de', 'User-Agent': 'hardloopweer/1.0' }
        });
        if (!pageRes.ok) {
            return res.status(pageRes.status).json({ error: 'DWD page unavailable' });
        }
        const html = await pageRes.text();
        const text = extractText(html);
        if (!text) {
            return res.status(404).json({ error: 'no text found' });
        }

        res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.status(200).send(text);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}
