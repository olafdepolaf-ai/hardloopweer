export default async function handler(req, res) {
    const { code } = req.query;
    if (!code || !/^DW[A-Z]{2}$/.test(code)) {
        return res.status(400).json({ error: 'invalid code' });
    }

    const baseUrl = 'https://opendata.dwd.de/weather/text_forecasts/txt/';

    // Primair: directory listing parsen voor meest recente bestand
    try {
        const dirRes = await fetch(baseUrl);
        if (dirRes.ok) {
            const html = await dirRes.text();
            const pat = new RegExp(
                `href="(ber01-VHDL13_${code}_[0-9]+(?:_COR)?-([0-9]{10})-dsw--0-ia5)"`, 'g'
            );
            const matches = [...html.matchAll(pat)];
            if (matches.length) {
                matches.sort((a, b) => b[2].localeCompare(a[2]));
                const file = matches[0][1];
                const fileRes = await fetch(`${baseUrl}${file}`);
                if (fileRes.ok) {
                    const text = await fileRes.text();
                    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
                    return res.status(200).send(text);
                }
            }
        }
    } catch { /* val door naar directe URL */ }

    // Fallback: bouw URL direct op basis van bekende DWD-uitgavetijden (08:00 UTC)
    const now = new Date();
    const candidates = [
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 0)),
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 8, 0)),
    ];

    for (const d of candidates) {
        const dd = String(d.getUTCDate()).padStart(2, '0');
        const hh = '08';
        const cyy = String(d.getUTCFullYear()).slice(-2);
        const cmo = String(d.getUTCMonth() + 1).padStart(2, '0');
        const cdd = String(d.getUTCDate()).padStart(2, '0');
        const ts1 = `${dd}${hh}00`;
        const ts2 = `${cyy}${cmo}${cdd}${hh}00`;
        const url = `${baseUrl}ber01-VHDL13_${code}_${ts1}-${ts2}-dsw--0-ia5`;
        try {
            const r = await fetch(url);
            if (r.ok) {
                const text = await r.text();
                res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
                return res.status(200).send(text);
            }
        } catch { /* probeer volgende */ }
    }

    return res.status(404).json({ error: 'DWD bericht niet gevonden' });
}
