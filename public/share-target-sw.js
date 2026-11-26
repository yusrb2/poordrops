self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const cache = await caches.open('poordrops-share-v1');

          const title = formData.get('title');
          const text = formData.get('text');
          const sharedUrl = formData.get('url');
          const textParts = [title, text, sharedUrl]
            .filter((v) => typeof v === 'string' && v.trim().length > 0)
            .map((v) => v.trim());

          const files = formData.getAll('files').filter((f) => f instanceof File && f.size >= 0);
          const manifest = {
            text: textParts.join('\n'),
            files: [],
          };

          for (let i = 0; i < files.length; i++) {
            const f = files[i];
            const key = `/__shared_file_${Date.now()}_${i}`;
            manifest.files.push({
              key,
              name: f.name || `shared-${i}`,
              type: f.type || 'application/octet-stream',
            });
            await cache.put(
              key,
              new Response(f, {
                headers: {
                  'Content-Type': f.type || 'application/octet-stream',
                },
              })
            );
          }

          await cache.put(
            '/__shared_manifest',
            new Response(JSON.stringify(manifest), {
              headers: { 'Content-Type': 'application/json' },
            })
          );
        } catch {
          // ignore malformed share payloads
        }
        return Response.redirect('/?shared=1', 303);
      })()
    );
  }
});
