const OPENDATA = 'https://opendata.dwd.de/weather/text_forecasts/txt/';

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

async function fetchTextFile(code) {
    // Server-side: geen CORS-beperking, opendata.dwd.de is direct bereikbaar

    // Stap 1: directory listing ophalen en meest recente bestand kiezen
    try {
        const dirRes = await fetch(OPENDATA, { headers: { 'User-Agent': 'hardloopweer/1.0' } });
        if (dirRes.ok) {
            const html = await dirRes.text();
            const pat = new RegExp(
                `href="(ber01-VHDL13_${code}_[0-9]+(?:_COR)?-([0-9]{10})-dsw--0-ia5)"`, 'g'
            );
            const matches = [...html.matchAll(pat)];
            if (matches.length) {
                matches.sort((a, b) => b[2].localeCompare(a[2]));
                const file = matches[0][1];
                const fileRes = await fetch(OPENDATA + file, { headers: { 'User-Agent': 'hardloopweer/1.0' } });
                if (fileRes.ok) return fileRes.text();
            }
        }
    } catch { /* val door */ }

    // Stap 2: directe URL op basis van DWD-uitgavetijd (08:00 UTC)
    const now = new Date();
    const candidates = [
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0)),
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 8, 0)),
    ];
    for (const d of candidates) {
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const cyy = String(d.getUTCFullYear()).slice(-2);
        const cmo = String(d.getUTCMonth() + 1).padStart(2, '0');
        const cdd = String(d.getUTCDate()).padStart(2, '0');
        const url = `${OPENDATA}ber01-VHDL13_${code}_${dd}0800-${cyy}${cmo}${cdd}0800-dsw--0-ia5`;
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'hardloopweer/1.0' } });
            if (r.ok) return r.text();
        } catch { /* probeer volgende */ }
    }

    return null;
}

async function scrapeWarnlage(code) {
    const path = REGION_PATHS[code];
    if (!path) return null;
    const url = `https://www.dwd.de/DE/wetter/warnungen_aktuell/warnlagebericht/${path}`;
    const res = await fetch(url, {
        headers: { 'Accept-Language': 'de', 'User-Agent': 'Mozilla/5.0 (compatible; hardloopweer/1.0)' }
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extraheer <p>-teksten uit de main content
    const blocks = [];
    const tagPat = /<(h[23]|p)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let m;
    while ((m = tagPat.exec(html)) !== null) {
        const tag = m[1].toLowerCase();
        const inner = m[2]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ').replace(/&#?\w+;/g, '')
            .replace(/\s+/g, ' ').trim();
        if (!inner || inner.length < 20) continue;
        blocks.push(tag === 'p' ? inner : `**${inner}**`);
    }
    return blocks.length ? blocks.join('\n\n') : null;
}

module.exports = async function handler(req, res) {
    const { code } = req.query;
    if (!code || !/^DW[A-Z]{2}$/.test(code)) {
        return res.status(400).json({ error: 'invalid code' });
    }

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    // Primair: DWD opendata tekstbestand (server-side, geen CORS)
    try {
        const text = await fetchTextFile(code);
        if (text && text.trim().length > 100) {
            // Strip DWD-bestandsheader (alles voor eerste lege regel na regel 4)
            const lines = text.replace(/\r\n/g, '\n').split('\n');
            const firstBlank = lines.findIndex((l, i) => i > 3 && l.trim() === '');
            const body = (firstBlank > 0 ? lines.slice(firstBlank + 1) : lines).join('\n').trim();
            return res.status(200).send(body);
        }
    } catch { /* val door */ }

    // Fallback: DWD warnlage-pagina scrapen
    try {
        const text = await scrapeWarnlage(code);
        if (text) return res.status(200).send(text);
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }

    return res.status(404).json({ error: 'DWD bericht niet gevonden' });
};
