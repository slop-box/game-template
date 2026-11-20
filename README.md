# my-game

A [Slop Box](https://github.com/slop-box/slopboxhub) party game.

This repo started from `slop-box/game-template`. The template's demo is a buzzer: phones join with a name and race to buzz, and the TV shows the join QR code, the players, and who buzzed first. Replace the game and keep the plumbing.

## Start a new game from this template

1. **Create your repo:** on GitHub, open `slop-box/game-template`, click **Use this template → Create a new repository**, set the owner to `slop-box`, and clone it. Name the repo after your game's id (step 2), all lowercase, e.g. `space-lawyers`, so the repo, image and address all match.
2. **Choose your game's id:** lowercase letters, digits and hyphens, e.g. `space-lawyers`. It becomes your game's address (`https://<id>.<domain>`) and image name. Check that [games.json](https://github.com/slop-box/slopboxhub/blob/main/games.json) doesn't already use it.
3. **Set the id** everywhere in one go:
   ```
   npm run set-id -- space-lawyers
   ```
4. **Run it:**
   ```
   npm start
   ```
   - On your computer, open `http://localhost:3000/tv`.
   - On your phone (same Wi-Fi), open `http://<your-computer's-ip>:3000/` or scan the QR code on the TV page.

   There's nothing to install, because the template has no dependencies.
5. **Make your game.** Edit:
   - the game rules and state in `server.js`, in the section marked "game state"
   - the phone screen in `public/index.html` and `public/phone.js`
   - the TV screen in `public/tv.html` and `public/tv.js`
   - the test in `test.js`

   Run `npm test` before pushing. The publish workflow runs it too, and won't publish if it fails.
6. **Push to `main`.** This publishes `ghcr.io/slop-box/my-game`. After the first publish, open the package in the org's **Packages** tab, then go to **Package settings → Change visibility → Public**.
7. **Add the game to Slop Box** with a pull request on `slop-box/slopboxhub`, using the snippets below.

### Phone-only game?

A TV is optional:
- Delete `public/tv.html` and `public/tv.js`, and the `'/tv'` route in `server.js`.
- Set `"needsTv": false` in the `games.json` entry.

Players then open the game from the Slop Box page instead of scanning a QR code.

## Add it to Slop Box (hub pull request)

Add these three pieces to `slop-box/slopboxhub`. The server owner merges the pull request and turns the game on.

**`games.json`:** add an entry. Write `players` and `extraDevices` in lowercase, because they show as tags.
```json
{
  "id": "my-game",
  "name": "My Game",
  "players": "3–8",
  "needsTv": true,
  "extraDevices": [],
  "blurb": "One sentence that makes people want to play.",
  "repo": "https://github.com/slop-box/my-game"
}
```

**`docker-compose.yml`:** add a service. It must have no `ports:`, because Caddy is the only way in. The second label is the update lock: before updating the game, Watchtower runs it inside the container, and it skips the update while games are open at a party.
```yaml
  my-game:
    image: ghcr.io/slop-box/my-game:latest
    restart: unless-stopped
    networks: [slopbox]
    labels:
      com.centurylinklabs.watchtower.enable: "true"
      com.centurylinklabs.watchtower.lifecycle.pre-update: >-
        node -e "fetch('http://hub:8080/update-allowed?id=my-game').then(r=>process.exit(r.ok?0:75),()=>process.exit(75))"
    mem_limit: 512m
    cpus: 1.0
```
If the game saves anything, save it under `process.env.DATA_DIR` (`/app/data`) and give the game a Docker volume, `my-game-data`. Add it to the service:
```yaml
    volumes:
      - my-game-data:/app/data
```
Then add one line to the top-level `volumes:` block near the top of the file, next to `hub-data`. Leave the line bare:
```yaml
volumes:
  hub-data:
  my-game-data:
```
Docker fills the new volume from the image's `/app/data`. The Dockerfile already creates that folder owned by `node`, so the game can save with no setup on the server.

**`proxy/Caddyfile`:** add a route. `import gate` keeps the game closed until the host opens Slop Box for a party.
```
http://my-game.{$SLOPBOX_DOMAIN} {
	import gate
	reverse_proxy my-game:3000
}
```

## How it fits the Slop Box contract

The full rules are in [GAME_CONTRACT.md](https://github.com/slop-box/slopboxhub/blob/main/GAME_CONTRACT.md). This template already follows them:

- **Server:** listens on `$PORT` (default 3000), serves phones at `/` and the TV at `/tv`, and answers `GET /healthz`.
- **URLs:** the join QR code uses the address the TV opened (`location.origin`), so it shows `https://my-game.<domain>` behind Slop Box. Set `PUBLIC_URL` to override it.
- **Live updates:** server-sent events (`/events`), with actions sent as `POST /action`. Phones reconnect on their own after locking.
- **Docker:** non-root, saved data only in `/app/data`, the Watchtower label, and a healthcheck.
- **TV browsers:** the browser code avoids newer JavaScript and CSS, so older TV browsers (e.g. LG webOS 6) work.

## Updating the game on the server

- **Push to `main`:** the server picks it up on Watchtower's next scheduled run, but not while games are open at a party.
- **To test on the server:** just push. Watchtower checks every couple of minutes, so the game is usually live a few minutes after the publish finishes. The workflow's **Deploy now** box isn't turned on, so it only publishes the image and prints a warning.
