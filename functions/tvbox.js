// TVBox 统一网关 V4 - 公共源拉取 + 直播 + 缓存
// 从社区维护的 TVBox 源地址实时拉取，自动更新，零维护

var LIVE_URL = 'https://m3u.ibert.me/tvbox/fmml_itv.json';
var CACHE_KEY = new Request('https://internal.cache/tvbox-v4');
var CACHE_TTL = 21600; // 6小时

// 公共 TVBox 源地址（社区维护，自动更新）
var PUBLIC_SOURCES = [
    'http://home.jundie.top:81/top98.json',           // 俊于
    'https://agit.ai/Yoursmile7/TVBox/raw/branch/master/XC.json', // 南风
    'http://pandown.pro/tvbox/tvbox.json',             // 巧儿
];

// 内置保底源（公共源全部失败时用）
var FALLBACK_SITES = [
    {"key":"豆瓣","name":"豆瓣","type":3,"api":"csp_DouDou","searchable":0,"quickSearch":0,"filterable":0},
    {"key":"玩偶哥","name":"玩偶哥","type":3,"api":"csp_WoGG","searchable":1,"quickSearch":1,"changeable":0,"ext":{"Cloud-drive":"tvfan/Cloud-drive.txt","from":"4k|auto","siteUrl":"https://www.wogg.net/","danMu":"弹"}},
    {"key":"csp_NanGua","name":"南瓜","type":3,"api":"csp_NanGua","playerType":2,"searchable":1,"quickSearch":1,"changeable":1},
    {"key":"csp_Jpys","name":"文采","type":3,"api":"csp_Jpys","playerType":2,"searchable":1,"quickSearch":1,"changeable":1},
    {"key":"csp_Lgyy","name":"蓝光","type":3,"api":"csp_Lgyy","timeout":15,"playerType":2,"searchable":1,"quickSearch":1,"changeable":1},
    {"key":"csp_Wmkk","name":"完美","type":3,"api":"csp_Wmkk","searchable":1,"quickSearch":1,"changeable":1},
    {"key":"csp_Bili","name":"哔哩","type":3,"api":"csp_Bili","searchable":0,"quickSearch":0,"filterable":1,"ext":"https://gitea.com/Yoursmile7/Bili/raw/branch/main/json/bili.json"},
];

async function getCache() {
    var c = caches.default;
    var r = await c.match(CACHE_KEY);
    if (r) return await r.text();
    return null;
}

async function setCache(data) {
    var c = caches.default;
    await c.put(CACHE_KEY, new Response(data, {headers: {'Content-Type':'application/json','Cache-Control':'max-age='+CACHE_TTL}}));
}

// 带超时的 fetch
async function fetchTimeout(url, ms) {
    var ctrl = new AbortController();
    var t = setTimeout(function() { ctrl.abort(); }, ms);
    try {
        var r = await fetch(url, {signal: ctrl.signal});
        clearTimeout(t);
        return r;
    } catch(e) {
        clearTimeout(t);
        return null;
    }
}

// 从公共源拉取并合并点播站点
async function fetchVodSites() {
    var results = await Promise.allSettled(
        PUBLIC_SOURCES.map(function(url) { return fetchTimeout(url, 8000); })
    );
    
    var allSites = [];
    var seenKeys = new Set();
    
    for (var i = 0; i < results.length; i++) {
        if (results[i].status === 'fulfilled' && results[i].value && results[i].value.ok) {
            try {
                var data = await results[i].value.json();
                if (data && data.sites && data.sites.length > 0) {
                    for (var j = 0; j < data.sites.length; j++) {
                        var site = data.sites[j];
                        if (site && site.key && !seenKeys.has(site.key)) {
                            allSites.push(site);
                            seenKeys.add(site.key);
                        }
                    }
                }
            } catch(e) {}
        }
    }
    
    // 如果公共源全部失败，用保底源
    if (allSites.length === 0) {
        return FALLBACK_SITES;
    }
    
    return allSites;
}

async function fetchLive() {
    try {
        var r = await fetchTimeout(LIVE_URL, 8000);
        if (r && r.ok) return await r.json();
    } catch(e) {}
    return {lives: []};
}

export async function onRequest(context) {
    var request = context.request;
    
    if (request.method === 'OPTIONS') {
        return new Response(null, {headers: {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Content-Type'}});
    }
    
    var headers = {'Content-Type':'application/json;charset=UTF-8','Access-Control-Allow-Origin':'*'};
    
    try {
        // 1. 先查缓存
        var cached = await getCache();
        if (cached) {
            return new Response(cached, {headers: headers});
        }
        
        // 2. 并行拉取直播 + 点播
        var results = await Promise.allSettled([fetchLive(), fetchVodSites()]);
        
        var result = {sites: [], lives: []};
        
        if (results[0].status === 'fulfilled' && results[0].value) {
            if (results[0].value.lives) result.lives = results[0].value.lives;
        }
        
        if (results[1].status === 'fulfilled' && results[1].value) {
            result.sites = results[1].value;
        } else {
            result.sites = FALLBACK_SITES;
        }
        
        var json = JSON.stringify(result);
        
        // 3. 写缓存
        context.waitUntil(setCache(json));
        
        return new Response(json, {headers: headers});
    } catch(e) {
        var fb = JSON.stringify({sites: FALLBACK_SITES, lives: []});
        return new Response(fb, {headers: headers});
    }
}
