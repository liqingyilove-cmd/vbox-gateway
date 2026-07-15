// ============================================================
// TVBox 统一网关 - 合并 直播 + 点播
// 部署到 Cloudflare Pages Functions 后,
// TVBox 配置地址填: https://xxx.pages.dev/tvbox
// ============================================================

// ★★★ 部署后可通过 Cloudflare Pages 环境变量覆盖 ★★★
// LIVE_SOURCE_URL  - 直播源 TVBox JSON 地址
// VOD_SOURCE_URL   - 点播源 subscribe.json 地址
//
// 默认值直接使用公共源，你也可以自行部署 iptv-sources 后替换

const DEFAULT_LIVE_URL = 'https://m3u.ibert.me/tvbox/fmml_itv.json';
const DEFAULT_VOD_URL = 'https://YOUR-VOD.pages.dev/subscribe.json';

const CACHE_TTL = 300; // Cloudflare CDN 缓存 5 分钟

export async function onRequest(context) {
  const { request, env } = context;

  // 从环境变量读取，支持部署后修改
  const liveUrl = env.LIVE_SOURCE_URL || DEFAULT_LIVE_URL;
  const vodUrl = env.VOD_SOURCE_URL || DEFAULT_VOD_URL;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    console.log(`Fetching live from: ${liveUrl}`);
    console.log(`Fetching vod from: ${vodUrl}`);

    // 并行获取
    const [liveRes, vodRes] = await Promise.allSettled([
      fetchWithTimeout(liveUrl, 15000),
      fetchWithTimeout(vodUrl, 15000),
    ]);

    const result = {
      sites: [],
      lives: [],
    };

    // 解析直播源
    if (liveRes.status === 'fulfilled' && liveRes.value && liveRes.value.ok) {
      try {
        const liveData = await liveRes.value.json();
        if (liveData && Array.isArray(liveData.lives)) {
          result.lives = liveData.lives;
          console.log(`Live sources loaded: ${liveData.lives.length} groups`);
        }
      } catch (e) {
        console.error('Live parse error:', e.message);
      }
    } else {
      console.warn('Live source fetch failed');
    }

    // 解析点播源
    if (vodRes.status === 'fulfilled' && vodRes.value && vodRes.value.ok) {
      try {
        const vodData = await vodRes.value.json();
        if (vodData && Array.isArray(vodData.sites)) {
          result.sites = vodData.sites;
          console.log(`VOD sites loaded: ${vodData.sites.length} sites`);
        }
      } catch (e) {
        console.error('VOD parse error:', e.message);
      }
    } else {
      console.warn('VOD source fetch failed');
    }

    return new Response(JSON.stringify(result), { headers });

  } catch (error) {
    console.error('Gateway error:', error.message);
    return new Response(JSON.stringify({
      sites: [],
      lives: [],
      error: error.message
    }), { status: 200, headers }); // 返回 200 避免 TVBox 报错
  }
}

// 带超时的 fetch
async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
