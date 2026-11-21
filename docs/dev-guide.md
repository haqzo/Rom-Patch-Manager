# Dev tools guide (Haqzo & MaToRiuKo)

Everything you change is a **draft** that only you can see, until you press **Publish**.

## 1. Sign in (once per device)
1. On github.com go to **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Set it up like this:
   - Repository access: **Only select repositories →** `haqzo/Rom-Patch-Manager`
   - Permissions: **Contents: Read and write** and **Pull requests: Read and write**
   - Expiry: e.g. 90 days
3. Copy the token. In the **Dev** tab, open **Publish**, paste the token, tick **Remember on this device** (only on your own PC) and press **Sign in**.
4. It should say **"Signed in as … ✅ can publish"**.

## 2. Change the library
Edit from either place:
- **In the normal tabs:** press the **✎** button on a card to edit it, or use **+ Add item** / **✎ Category** at the top of the tab.
- **In the Dev tab, Library section:** pick a category to see its list. **▲▼** reorders, **Edit** opens an item, and **+ New item** adds one.

In the editor you can:
- **Name** it in English, 中文 and Español (English is required) and give it a **Creator credit**.
- Add a **Description**.
- Change the **Category**.
- Manage **Files**: each row means "this archive + entry gets this file". **Replace…** swaps a file; if the same file is used in several rows, you can replace it everywhere at once. Every file is checked before it's accepted.
- Set a **Preview picture** (cropped to 480×288). Without one, the site renders a 3D preview.
- **Duplicate** · **Archive** (hides it for users, and you can **Restore** it later) · **Remove…** (permanent once published).

Press **Save to draft**. The site in your browser now shows the change, and nobody else sees it yet.

Battle backgrounds work the same way, from the **Battle backgrounds** tab or Library → *Battle backgrounds*. Each one has a model, optionally an animation (or "Model only"), and the battle types it was made for.

## 3. Categories
In the **Dev tab → Categories** section:
- **▲▼** sets the order of the tabs.
- **Edit** changes the name, description, icon, or makes it hidden.
- **+ New category** makes a new tab where users pick one item. Give it the archive path and entry numbers its items replace.

## 4. Presets (official combos)
In the **Dev tab → Presets** section, press **+ New preset**:
1. Give it a name, an optional description, and a group.
2. Pick one item per category and, if you want, battle backgrounds per battle type.
3. Or press **Fill from my current picks**: select things in the normal tabs first, then press it.

Users see presets in the **Presets** tab and apply them with one click.

## 5. Publish
Go to the **Dev tab → Publish** section and check the list of changes:
- **⛔** problems block publishing, for example a missing file or a preset using a removed item.
- **⚠️** are only warnings.

Then choose one:
- **Publish to the website…**: live for everyone in about 2–3 minutes. Open tabs update within 10 minutes.
- **Send for review (pull request)…**: nothing changes until the other person merges it on GitHub. Use this when you're unsure.

Other buttons:
- **Discard draft…** throws away all unpublished changes.
- Untick **Show the draft in this browser** to see the live site again without losing your draft.

## Good to know
- The draft is kept in **this browser only**. On another PC or browser, you start with an empty draft.
- If you both publish at the same time, both sets of changes are kept. If you both edited the same item, the last one to publish wins for that item.
- **My items & packs** (.rpmpack) and **Battle platforms** work like before.
- Publishing only works with your own GitHub account. `?dev` alone can't change anything.
- Only tested offline. Always try new models in PokeMMO before publishing.
