var LIVE_URL = 'https://m3u.ibert.me/tvbox/fmml_itv.json';
var VOD_AGGREGATOR = 'https://tvbox-4pb.pages.dev';
var CACHE_KEY = new Request('https://internal.cache/tvbox-vod');

async function getCachedVod() {
    var cache = caches.default;
    var r = await cache.match(CACHE_KEY);
    if (r) return await r.json();
    return null;
}

async function setCachedVod(data) {
    var cache = caches.default;
    await cache.put(CACHE_KEY, new Response(JSON.stringify(data), {
        headers: {'Content-Type':'application/json','Cache-Control':'max-age=21600'}
    }));
}

async function fetchVod() {
    try {
        var r = await fetch(VOD_AGGREGATOR + '/subscribe.json');
        if (r.ok) {
            var d = await r.json();
            if (d && d.sites && d.sites.length > 0) return d;
        }
    } catch(e) {}
    try {
        var r2 = await fetch(VOD_AGGREGATOR + '/api/start-task');
        if (r2.ok) {
            var d2 = await r2.json();
            if (d2 && d2.sites) return d2;
        }
    } catch(e) {}
    return {sites: []};
}

async function fetchLive() {
    try {
        var r = await fetch(LIVE_URL);
        if (r.ok) return await r.json();
    } catch(e) {}
    return {lives: []};
}

export async function onRequest(context) {
    var request = context.request;
    var env = context.env;

    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            }
        });
    }

    var headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Access-Control-Allow-Origin': '*',
    };

    try {
        var cachedVod = await getCachedVod();
        var livePromise = fetchLive();
        var vodPromise = cachedVod ? Promise.resolve(cachedVod) : fetchVod();
        var results = await Promise.allSettled([livePromise, vodPromise]);

        var result = {sites: [], lives: []};

        if (results[0].status === 'fulfilled' && results[0].value) {
            if (results[0].value.lives) result.lives = results[0].value.lives;
        }
        if (results[1].status === 'fulfilled' && results[1].value) {
            if (results[1].value.sites) result.sites = results[1].value.sites;
            if (!cachedVod && results[1].value.sites && results[1].value.sites.length > 0) {
                context.waitUntil(setCachedVod(results[1].value));
            }
        }

        return new Response(JSON.stringify(result), {headers: headers});
    } catch(e) {
        return new Response(JSON.stringify({sites: [], lives: [], error: e.message}), {headers: headers});
    }
}
