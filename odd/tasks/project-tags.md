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

## Follow-up: separate catalogs (2026-11-10)
User confirmed that project tags must be a separate catalog from stage tags.

- [x] F1 — Replace `project_tags` with `project_tag_options` (org-scoped name/color)
  and `project_tag_assignments`; migrate any existing `project_tags` rows by copying
  names/colors into the new catalog, then drop the legacy table.
- [x] F2 — Add `/project-tags` CRUD endpoints; project assignment endpoints and project
  GET queries reference the new catalog.
- [x] F3 — Project tag dialog uses the project-only catalog; deleting a project tag no
  longer affects stage tags.
- [x] F4 — Stage tag counts/warning revert to stage-only semantics.

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
- 2026-11-10 (catálogos separados — F1-F4): Se separaron las etiquetas de proyecto de las
  de etapa. Antes reusaban la tabla `tags` vía `project_tags`; ahora existe un catálogo
  propio `project_tag_options` (org-scoped name/color, UNIQUE(org,name)) y la relación
  `project_tag_assignments (project_id, project_tag_id)`. El borrado en cascada de
  `project_tag_options` solo afecta asignaciones de proyecto; las etiquetas de etapa en
  `tags`/`stage_tags` quedan intactas y viceversa. Migración única en `initializeDatabase`:
  si existe la legacy `project_tags` (instalaciones previas) copia nombres/colores a
  `project_tag_options` y las asignaciones a `project_tag_assignments`, luego hace `DROP
  TABLE project_tags`; en instalaciones nuevas la legacy no existe y se omite (nada que
  migrar). Endpoints: `GET/POST/PUT/DELETE /project-tags` (catálogo), y
  `POST/DELETE /projects/:id/tags` validan contra `project_tag_options` e insertan/borran
  en `project_tag_assignments`. `GET /projects` y `GET /projects/:id` leen el catálogo de
  proyecto; `GET /tags` volvió a contar solo `stage_tags`. Cliente: nuevos métodos
  `getProjectTagOptions/createProjectTagOption/updateProjectTagOption/deleteProjectTagOption`;
  `ProjectTagsDialog` usa el catálogo de proyecto y el aviso de borrado aclara que no
  afecta etapas; `StageDetail` revirtió el aviso a solo `usage_count`. Builds api y client
  OK.
- 2026-11-10 (verificación de catálogos separados): PASS. La migración se movió dentro del
  bloque `db.serialize` porque la primera prueba sobre una copia de la DB real mostró que el
  `db.get` externo corría antes de crear `project_tag_options`. Repetida la prueba sobre una
  copia de la DB de producción con una fila legacy: se copiaron nombre/color y la asignación,
  y se eliminó `project_tags`. Builds api y client OK; verificación independiente PASS.
