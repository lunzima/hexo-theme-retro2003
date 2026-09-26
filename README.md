# retro2003

retro2003 is a theme for Hexo. It looks like a web portal from around 2003.

The layout has three columns. The borders look like the cells of a table. The body text
uses a serif font. The buttons look like they come from a desktop system of that time.
The color tokens come from real portal pages saved in the Wayback Machine.

The code under that look is modern. The scrolling announcement is a CSS animation. All
the icons are one inline SVG sprite. There are no decorative images.

The theme carries three site-level parts. Once you install the theme, you do not need to
add scripts to your site for them.

- A BGM player. It is a small player that you can drag. It downloads audio only when it
  is needed. The first screen loads no audio at all.
- A Live2D mascot. It is off by default. You must prepare the model and the render
  libraries yourself.
- Comments. They are off by default. They use Twikoo.

## Install

1. Put the whole retro2003 folder into your site's themes/ folder.
2. Write `theme: retro2003` in your site _config.yml.
3. Run `npm i`, then `npx hexo g`.

You need two renderers: hexo-renderer-ejs and hexo-renderer-stylus. A site created by
`hexo init` already has both.

We suggest that you add `stylus: compress: true` to your site _config.yml. style.styl
holds many notes meant for the person who maintains the theme. Without compression,
those notes go into style.css unchanged and are sent to every visitor. They are close to
20 KB, about 40% of the uncompressed file. There is no reason for visitors to pay for
that.

The theme settings are in themes/retro2003/_config.yml. To replace one of them, add a
`theme_config:` block to your site _config.yml, using the same key names. The value on
the site side wins. This way you can replace the theme folder when you upgrade it, and
your own settings stay.

Hexo copies the theme's source/ folder to public/ unchanged. Templates can therefore
link to /js/... and /audio/... directly.

## Player

The player is on by default. Its settings are under `bgm:`.

```yaml
bgm:
  enable: true
  artist: ""            # shown on lock screens and media keys; leave empty to show only the track name
  tracks:
    - name: 卡农
      src: /audio/canon.webm
      seconds: 130.8
```

- To add a track, add an item to tracks. `src` is the address the browser fetches. Put
  the audio file in your site's source/audio/ folder, or in the theme's. Hexo copies it
  to public/audio/.
- Fill in `seconds` correctly. The progress bar is drawn from it. A value that is too
  small makes the player jump to the next track before the audio ends. A value that is
  too large leaves the bar unfilled.
- The player only plays WebM/Opus. At start it tests for `audio/webm; codecs=opus`, and
  if the test fails the whole player does not appear. Swapping in an mp3 is therefore not
  a change of file but a disappearance of the player. To use another format you must also
  change that test, near the top of source/js/bgm-player.js.
- The theme carries one sample track, source/audio/canon.webm. The shipped config names
  it 卡农, which is Chinese for Canon. If you replace the file, update both `src` and
  `seconds` in tracks. This file is 130.8 seconds long.
- Track names and lengths are written into the page at build time (`window.__BGM__`). Run
  `hexo g` again after you change them.
- Volume, mute, the collapsed state and the dragged position are kept in localStorage.
  The playback position is kept in sessionStorage. On a narrow screen (760px or less) the
  player starts collapsed into a square. You can also drag it into a corner and leave it
  there. It remembers where it is.
- Your server must send audio/webm for .webm files. The mime.types file that ships with
  nginx maps them to video/webm. Chrome and Firefox do not mind. Safari does. WebM/Opus
  is supported only from Safari 17.4, so the weakest browser is the one most likely to
  trip over the type. A `types` block inside a location replaces the whole type table for
  that location, so list every type that can appear under /audio/:

  ```nginx
  location ^~ /audio/ {
      types { audio/webm webm; }
      expires 30d;
  }
  ```

## Mascot

The mascot is off by default. Neither the model nor the four libraries ship with the
theme. You prepare them yourself.

```yaml
live2d:
  enable: true
  libs:
    - /lib/live2d/promise-polyfill.min.js
    - /lib/live2d/pixi.min.js
    - /lib/live2d/live2dcubismcore.min.js
    - /lib/live2d/pixi-live2d-display.min.js
  model_base: /resources/my-model     # this folder must hold model.model3.json
  fallback: /img/mascot.png           # shown when WebGL is missing or the model fails; empty shows nothing
  width: 480                          # logical size of the canvas
  height: 270
  mobile: false                       # show it on phones? it covers the content on a small screen
```

The four libraries:

- Cubism Core (live2dcubismcore.min.js) is proprietary code from Live2D Inc. that may be
  redistributed. Live2D does not publish it on npm. Download the SDK from the Live2D
  website and agree to their license. The package of the same name on npm is a republish
  by a third party whose trustworthiness is unknown; do not use it instead.
- pixi.js, pixi-live2d-display and promise-polyfill can be installed from npm. Copy the
  files out of their dist folders into your site's source/lib/live2d/, or point to a CDN
  address. Use the dist/cubism4 build of pixi-live2d-display. The cubism2 build is for
  Cubism 2 models, and models will not load with it.
- The order of `libs` matters. promise-polyfill must come first. Cubism Core sets
  `window.Live2DCubismCore`, and pixi-live2d-display reads it while its own script is
  being evaluated, so Core must come before display. The order above works as it stands.
- pixi.js and pixi-live2d-display must match. pixi 7.x with pixi-live2d-display
  0.5.0-beta works. The older display builds made for pixi 6 do not work with pixi 7.

About the model: `model_base` points to the model folder, which must be reachable over
HTTP. The folder must hold model.model3.json and the files it refers to: moc3, textures,
physics, display information and so on. Not every model has motions and expressions.
Without them the character just stands there and its eyes follow the mouse.

Things the runtime does, which save you time when something goes wrong:

- It checks abilities first. A machine that cannot give a WebGL context, or that reports
  a hardwareConcurrency below 2, does not load the model and falls back to the static
  image. A library or model that fails to load does the same. In both cases it leaves a
  note in the console and the page carries on.
- It reads the user agent and exits early on phones, without even fetching the model. To
  show it on a small screen, set `mobile` to true.
- The container is decoration only, and it has `pointer-events: none`. It takes no
  clicks, and its transparent pixels do not block clicks either. Following the mouse with
  its eyes is its only interaction. Do not change this. If you make it interactive, the
  whole rectangle will swallow clicks meant for the page.
- Neither the mascot nor the comment area appears on paper when the page is printed.

## Comments

Comments are off by default. Only Twikoo is implemented.

```yaml
comments:
  enable: true
  twikoo_env: https://your-domain/twikoo
```

- `twikoo_env` is the envId for twikoo.init, which is the address of your Twikoo server.
  If it is empty, the whole block is left out.
- The front-end library does not ship with the theme either. Put the Twikoo release file
  at source/lib/twikoo/twikoo.all.min.js in your site; Hexo copies it to
  public/lib/twikoo/. That address is hard-coded in layout/_partial/comments.ejs, so
  moving the file means changing that line.
- The comment box does not load with the page. The 810 KB script is fetched only when a
  reader clicks the button labelled 发表评论 ("post a comment"). The comment area sits
  below the first screen anyway, so there is no reason for every visitor to carry it.
- A successful submit pops nothing up. The form clears and the list reloads once. A
  comment that has just arrived usually needs approval before it appears, so the page
  carries a separate line, 已提交，确认后会显示 ("submitted; it will show once approved").
  This keeps the submit from looking as if it were lost.
- You can turn the comment area off for one post by writing `comments: false` in its
  front-matter.

## Other settings

### palette

```yaml
palette: default
```

`default` is the water scheme. It is the base scheme, and it is what you get when you
write nothing. To pin one scheme, write wind, stone, thunder, grass, fire or ice. To let
visitors see something different over time, write `weekly`. That changes the scheme once
a week, at midnight on Monday, UTC+8. The cycle is seven weeks long and returns to
`default` for one of them.

`weekly` runs a short synchronous script before the first screen. The script puts the
scheme on the `<html>` element, so the colors do not flash and then change. All seven
schemes are compiled into one CSS file and told apart by attribute selectors. This adds
about 2,300 bytes, which is the price of moving the choice from the server to the browser.

### menu

```yaml
menu:
  Posts: /archives/
  About: /about/
```

Each key is the text shown in the menu. Each value is the link. Write as many items as
you like. Write an empty object and only the site name is left.

### sidebar

The left column (quick index, categories, tags) and the right column (subscribe, follow
and contact) share this group of switches. The home page and the content pages use the
same layout. All are on by default; write false to turn one off.

```yaml
sidebar:
  quick_index: true
  categories: true
  tags: true
  subscribe: true
  social: true
```

### marquee

The scrolling announcement above the footer. Standard on portals in 2003.

```yaml
marquee:
  enable: true
  text: "本站重新开通博客功能 · 博主不定期写一些乱七八糟的内容"
```

For visitors who ask for less motion (prefers-reduced-motion) it becomes a still
announcement in the center. It does not disappear. The text is information; it simply
does not scroll.

### footer

```yaml
footer:
  since: ""     # first year of the site; leave empty to print only the current year
  beian: ""     # a record number such as a Chinese ICP filing; leave empty and the line is not shown
```

### social_links

```yaml
social_links:
  rss: /atom.xml
  github: ""
  email: ""
```

An item that is empty, or that you leave out, is not written out. For email, write the
bare address and `mailto:` is added for you. The text shown comes from the social
section of languages/zh-CN.yml, which already has rss and github. For any other key, the
key itself is used as the text.

## What the theme does not include

These are either large or carry license limits, so they stay on the site side. This
README can only remind you about them.

- Fonts and icons. The @font-face rules in style.styl and the preload links in head.ejs
  point to /fonts/*.woff2, and the favicon links point to /favicon.ico, /favicon-32.png
  and /apple-touch-icon.png. These files are not in the theme. Missing ones give a 404
  and nothing more; the text falls back to a local font, and the local() fallbacks are
  already written to match the metrics.
- The search index. The search box fetches /search.json when it is focused. Your site has
  to generate that file. Install a search index generator, or write a generator yourself.
  Without it, the search box only says that the index failed to load.
- The libraries under /lib/live2d and /lib/twikoo, the Twikoo server and the mascot model
  all have to be prepared by you. See the two sections above.

## Folder layout

```
retro2003/
  _config.yml          theme settings
  layout/              templates; layout.ejs is the frame, _partial/ holds the blocks
  layout/_partial/     bgm.ejs, mascot.ejs and comments.ejs each carry a switch
  languages/zh-CN.yml  interface text
  source/css/          style.styl and six color token files
  source/js/           retro.js (sidebar folding and search), bgm-player.js, l2d-runtime.js
  source/audio/        sample track
```

## License

MIT. See LICENSE. The sample audio in the theme (source/audio/canon.webm) is given under
MIT as well.
