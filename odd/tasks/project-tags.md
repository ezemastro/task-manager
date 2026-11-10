# Project tags (etiquetas de proyecto)

## Objective
Let each project carry multiple reusable, editable tags (name + color) shown next to its
description, assignable from the projects list and the project detail, and filterable in
"My Projects".

## Problem
Projects have description/contact/client/responsible/deadline but no way to mark important
characteristics of the work (e.g. "techos", "piscina", "reforma"). Users need a fast way to
tag a project from the list or detail and then filter the list by tag.

## Scope
- New `project_tags` many-to-many table reusing the existing organization-scoped `tags` table.
- API: assign/remove a tag on a project; return a project's tags in project list/detail.
- UI: tag chips next to the project description on cards and detail.
- UI: "Agregar etiqueta" icon on project cards and button on project detail.
- UI: shared dialog to assign/remove tags and create/rename/recolor/delete tag options.
- UI: tag filter in "Mis Proyectos" (client-side, persisted with the other filters).

## Out of scope
- AI assistant creating or assigning project tags.
- Tag filters in paused/completed project views.
- Destructive schema changes to existing tables.

## Tasks
- [x] T1 — DB + API: `project_tags` table; `POST /projects/:id/tags`;
  `DELETE /projects/:id/tags/:tagId`; include `tags` in `GET /projects` and
  `GET /projects/:id`.
- [x] T2 — Client API: `Project.tags`, `addTagToProject`, `removeTagFromProject`.
- [x] T3 — `ProjectTagsDialog` component: assign/remove, create, rename, recolor, delete
  tag options.
- [x] T4 — `ProjectCard`: tag chips + "Agregar etiqueta" icon (optional props so other
  views are unaffected).
- [x] T5 — "Mis Proyectos": tag filter, persistence, dialog wiring, silent refresh.
- [x] T6 — `ProjectDetail`: chips next to description + "Agregar etiqueta" button/dialog.
- [x] T7 — Builds and independent verification.

## Acceptance criteria
- A project can have zero, one, or many tags.
- Tags can be created, renamed, recolored, and deleted from the project tag dialog.
- Assign/remove works from both the projects list and the project detail.
- The projects list filters by a selected tag and shows the active filter chip.
- Tags are visible next to the description on cards and detail.
- Deleting a tag removes it from projects and stages (existing cascade behavior).
- Existing projects/stages/API behavior is unchanged when no tags are used.

## Verification
- `npm run build --prefix api`
- `npm run build --prefix client`
- Independent verifier: check schema, endpoints, UI wiring, no leftover references,
  builds pass.

## Route
Delegated direct — one bounded writer (6+ non-trivial files). No SDD artifacts.

## Progress
- 2026-11-10: Feature branch `feat/project-tags` created. Task document created before
  the first source write.
- 2026-11-10: Implemented T1-T6 end to end. `project_tags` table created with org-scoped
  endpoints; projects list and detail return `tags`; reusable `ProjectTagsDialog` handles
  assign/remove/create/rename/recolor/delete; list filter + persistence wired through
  `ProjectReturnFilters`/`selectedTag`.
- 2026-11-10: Verification run — `npm run build` passes for both api and client; grep
  confirms `project_tags` (table + both endpoints + both GET attachments) and `selectedTag`
  wired end to end; `git status` shows only the 8 in-scope files changed. No runtime/e2e
  executed (out of scope for this pass); acceptance needs a manual/manual-API smoke test
  against a real org to confirm org-scoping and cascade on tag delete.
- 2026-11-10 (corrección): Fix 1 — `GET /tags` ahora cuenta también `project_tags`
  (`project_usage_count`). Fix 2 — `Tag.project_usage_count` añadido y aviso de borrado en
  StageDetail usa ambos conteos. Fix 3 — efecto que limpia `selectedTag` restaurado si la
  etiqueta ya no existe + label del chip con fallback. Fix 4 — `DELETE /projects/:id/tags/:tagId`
  verifica que la etiqueta pertenece a la org. Builds de api y client OK; sin runtime/e2e.
- 2026-11-10 (verificación independiente): PASS tras la corrección. Se revisaron schema,
  endpoints, rutas de lectura, tipos, diálogo, tarjeta, filtro, detalle y regresiones;
  builds de api y client OK. Queda pendiente un smoke test manual contra una org real
  (aislamiento por org y cascada al borrar etiqueta).
