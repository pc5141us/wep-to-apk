export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  const tag = url.searchParams.get('tag');
  const filename = url.searchParams.get('filename');

  if (!tag || !filename) {
    return new Response("Missing tag or filename", { status: 400 });
  }

  try {
    // 1. Fetch release info
    const releaseRes = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/releases/tags/${tag}`, {
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Vercel-Edge-Function'
      }
    });

    if (!releaseRes.ok) {
      return new Response("Release not found", { status: 404 });
    }

    const releaseData = await releaseRes.json();
    let asset = releaseData.assets.find(a => a.name === filename || a.label === filename);
    if (!asset) {
      asset = releaseData.assets.find(a => a.name.endsWith('.apk'));
    }

    if (!asset) {
      return new Response("Asset not found", { status: 404 });
    }

    // 2. Fetch the asset to get the S3 redirect URL
    const assetRes = await fetch(asset.url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/octet-stream',
        'User-Agent': 'Vercel-Edge-Function'
      },
      redirect: 'manual' // We want to intercept the 302 redirect
    });

    let s3Url;
    if (assetRes.status === 302 || assetRes.status === 301) {
      s3Url = assetRes.headers.get('location');
    } else {
      return new Response("Failed to get S3 redirect", { status: 500 });
    }

    // 3. Proxy the S3 stream back to the client with the custom filename
    const s3Response = await fetch(s3Url);
    
    // Create new headers based on S3 response
    const headers = new Headers(s3Response.headers);
    const encodedName = encodeURIComponent(filename);
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
    headers.set('Content-Type', 'application/vnd.android.package-archive');

    return new Response(s3Response.body, {
      status: s3Response.status,
      headers: headers
    });
  } catch (error) {
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}
