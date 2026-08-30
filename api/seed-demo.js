/**
 * Demo data seeder for local testing.
 *
 * Writes into an ISOLATED database (default: api/demo-data/database.sqlite) so the
 * real dev database at api/database.sqlite is never modified. Point the API at the
 * same directory with DB_PATH=./demo-data when you run it.
 *
 * Usage (from the api/ directory):
 *   node seed-demo.js
 *   node seed-demo.js --db ./demo-data/database.sqlite
 *
 * The seeder is idempotent: it wipes the org-scoped tables and the demo account,
 * then rebuilds a clean, predictable dataset.
 */

const path = require('path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DEMO_EMAIL = 'demo@taskmanager.local';
const DEMO_PASSWORD = 'Demo1234!';
const DEMO_ACCOUNT_NAME = 'Ana Demo';
const DEMO_ORG = 'Estudio Demo';

function resolveDbPath() {
  const flagIndex = process.argv.indexOf('--db');
  if (flagIndex !== -1 && process.argv[flagIndex + 1]) {
    return path.resolve(process.argv[flagIndex + 1]);
  }
  return path.resolve(__dirname, 'demo-data', 'database.sqlite');
}

/** Returns an ISO datetime string offset from now by the given number of days. */
function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function main() {
  const dbPath = resolveDbPath();
  console.log('Seeding demo data into:', dbPath);

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');

  const passwordHash = bcrypt.hashSync(DEMO_PASSWORD, bcrypt.genSaltSync(10));

  db.exec('BEGIN');
  try {
    // ---- Wipe previous demo state -------------------------------------------
    // Deleting the organization cascades to members, users, clients, projects,
    // stages, cycles, tags, stage_tags, comments and audit logs.
    const existingOrg = db
      .prepare('SELECT id FROM organizations WHERE name = ?')
      .get(DEMO_ORG);
    if (existingOrg) {
      db.prepare('DELETE FROM organizations WHERE id = ?').run(existingOrg.id);
    }
    db.prepare('DELETE FROM accounts WHERE email = ?').run(DEMO_EMAIL);

    // ---- Account (pre-verified so login works without the email flow) -------
    const accountId = db
      .prepare(
        `INSERT INTO accounts (email, password_hash, name, email_verified)
         VALUES (?, ?, ?, 1)`
      )
      .run(DEMO_EMAIL, passwordHash, DEMO_ACCOUNT_NAME).lastInsertRowid;

    // ---- Organization and membership ---------------------------------------
    const orgId = db
      .prepare('INSERT INTO organizations (name) VALUES (?)')
      .run(DEMO_ORG).lastInsertRowid;

    db.prepare(
      `INSERT INTO organization_members (account_id, organization_id, role, scopes)
       VALUES (?, ?, 'admin', '["admin"]')`
    ).run(accountId, orgId);

    // ---- Team members -------------------------------------------------------
    // users.account_email is a foreign key into accounts(email), so every team
    // member needs an account row first. Only the admin account is meant for
    // logging in; the other two exist so the org has assignable responsibles.
    const insertAccount = db.prepare(
      `INSERT INTO accounts (email, password_hash, name, email_verified)
       VALUES (?, ?, ?, 1)`
    );
    for (const [email, name] of [
      ['bruno@taskmanager.local', 'Bruno Diseño'],
      ['carla@taskmanager.local', 'Carla Desarrollo'],
    ]) {
      db.prepare('DELETE FROM accounts WHERE email = ?').run(email);
      insertAccount.run(email, passwordHash, name);
    }

    const insertUser = db.prepare(
      'INSERT INTO users (organization_id, account_email, name, role) VALUES (?, ?, ?, ?)'
    );
    const adminUserId = insertUser.run(
      orgId,
      DEMO_EMAIL,
      DEMO_ACCOUNT_NAME,
      'Administrador'
    ).lastInsertRowid;
    const brunoId = insertUser.run(
      orgId,
      'bruno@taskmanager.local',
      'Bruno Diseño',
      'Diseñador'
    ).lastInsertRowid;
    const carlaId = insertUser.run(
      orgId,
      'carla@taskmanager.local',
      'Carla Desarrollo',
      'Desarrolladora'
    ).lastInsertRowid;

    // ---- Clients ------------------------------------------------------------
    const insertClient = db.prepare(
      'INSERT INTO clients (organization_id, name, email, phone) VALUES (?, ?, ?, ?)'
    );
    const clientNorte = insertClient.run(
      orgId,
      'Panadería del Norte',
      'contacto@panaderianorte.test',
      '+54 11 4001-0001'
    ).lastInsertRowid;
    const clientVega = insertClient.run(
      orgId,
      'Clínica Vega',
      'admin@clinicavega.test',
      '+54 11 4002-0002'
    ).lastInsertRowid;
    const clientRuta = insertClient.run(
      orgId,
      'Transportes Ruta 9',
      'operaciones@ruta9.test',
      '+54 11 4003-0003'
    ).lastInsertRowid;

    // ---- Stage templates ----------------------------------------------------
    const insertTemplate = db.prepare(
      `INSERT INTO stage_templates
       (organization_id, name, order_number, default_responsible_id, estimated_duration_days)
       VALUES (?, ?, ?, ?, ?)`
    );
    insertTemplate.run(orgId, 'Relevamiento', 1, adminUserId, 3);
    insertTemplate.run(orgId, 'Diseño', 2, brunoId, 7);
    insertTemplate.run(orgId, 'Desarrollo', 3, carlaId, 14);
    insertTemplate.run(orgId, 'Entrega', 4, adminUserId, 2);

    // ---- Tags ---------------------------------------------------------------
    const insertTag = db.prepare(
      'INSERT INTO tags (organization_id, name, color) VALUES (?, ?, ?)'
    );
    const tagUrgente = insertTag.run(orgId, 'Urgente', '#e53935').lastInsertRowid;
    const tagBloqueado = insertTag.run(orgId, 'Bloqueado', '#fb8c00').lastInsertRowid;
    const tagRevision = insertTag.run(orgId, 'Revisión', '#1e88e5').lastInsertRowid;
    insertTag.run(orgId, 'Interno', '#8e24aa');

    // ---- Projects -----------------------------------------------------------
    const insertProject = db.prepare(
      `INSERT INTO projects
       (organization_id, name, description, contact, client_id, responsible_id,
        deadline, status, completed_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const pWeb = insertProject.run(
      orgId,
      'Sitio web Panadería del Norte',
      'Rediseño completo del sitio institucional con catálogo de productos.',
      'Marta Giménez',
      clientNorte,
      carlaId,
      daysFromNow(21),
      'active',
      null
    ).lastInsertRowid;

    const pTurnos = insertProject.run(
      orgId,
      'Sistema de turnos Clínica Vega',
      'Aplicación de reserva de turnos con recordatorios automáticos.',
      'Dr. Vega',
      clientVega,
      carlaId,
      daysFromNow(45),
      'active',
      null
    ).lastInsertRowid;

    const pIdentidad = insertProject.run(
      orgId,
      'Identidad visual Ruta 9',
      'Manual de marca, logotipo y aplicaciones para flota.',
      'Sergio Paz',
      clientRuta,
      brunoId,
      daysFromNow(10),
      'active',
      null
    ).lastInsertRowid;

    const pApp = insertProject.run(
      orgId,
      'App de pedidos Panadería del Norte',
      'Aplicación móvil de pedidos. En pausa hasta definir presupuesto.',
      'Marta Giménez',
      clientNorte,
      brunoId,
      daysFromNow(90),
      'paused',
      null
    ).lastInsertRowid;

    const pLanding = insertProject.run(
      orgId,
      'Landing campaña invierno Clínica Vega',
      'Landing de campaña estacional, ya entregada.',
      'Dr. Vega',
      clientVega,
      carlaId,
      daysFromNow(-15),
      'completed',
      daysFromNow(-12)
    ).lastInsertRowid;

    const pAuditoria = insertProject.run(
      orgId,
      'Auditoría de accesibilidad Ruta 9',
      'Revisión WCAG del portal de seguimiento de envíos.',
      'Sergio Paz',
      clientRuta,
      adminUserId,
      daysFromNow(30),
      'active',
      null
    ).lastInsertRowid;

    // ---- Stages -------------------------------------------------------------
    const insertStage = db.prepare(
      `INSERT INTO stages
       (project_id, template_id, name, responsible_id, start_date, intermediate_date,
        estimated_end_date, completed_date, order_number, is_completed)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    // Sitio web: first two done, third running, fourth not started.
    const sWebRelev = insertStage.run(pWeb, 'Relevamiento', adminUserId, daysFromNow(-20), null, daysFromNow(-17), daysFromNow(-17), 1, 1).lastInsertRowid;
    const sWebDiseno = insertStage.run(pWeb, 'Diseño', brunoId, daysFromNow(-16), null, daysFromNow(-9), daysFromNow(-8), 2, 1).lastInsertRowid;
    const sWebDev = insertStage.run(pWeb, 'Desarrollo', carlaId, daysFromNow(-7), daysFromNow(3), daysFromNow(14), null, 3, 0).lastInsertRowid;
    insertStage.run(pWeb, 'Entrega', adminUserId, null, null, daysFromNow(21), null, 4, 0);

    // Turnos: relevamiento done, diseño running.
    insertStage.run(pTurnos, 'Relevamiento', adminUserId, daysFromNow(-10), null, daysFromNow(-7), daysFromNow(-6), 1, 1);
    const sTurnosDiseno = insertStage.run(pTurnos, 'Diseño', brunoId, daysFromNow(-5), null, daysFromNow(9), null, 2, 0).lastInsertRowid;
    insertStage.run(pTurnos, 'Desarrollo', carlaId, null, null, daysFromNow(35), null, 3, 0);
    insertStage.run(pTurnos, 'Entrega', adminUserId, null, null, daysFromNow(45), null, 4, 0);

    // Identidad: running, tight deadline.
    const sIdentRelev = insertStage.run(pIdentidad, 'Relevamiento', adminUserId, daysFromNow(-12), null, daysFromNow(-9), daysFromNow(-9), 1, 1).lastInsertRowid;
    const sIdentDiseno = insertStage.run(pIdentidad, 'Diseño', brunoId, daysFromNow(-8), daysFromNow(-2), daysFromNow(6), null, 2, 0).lastInsertRowid;
    insertStage.run(pIdentidad, 'Entrega', brunoId, null, null, daysFromNow(10), null, 3, 0);

    // Paused project keeps one untouched stage.
    insertStage.run(pApp, 'Relevamiento', brunoId, null, null, daysFromNow(60), null, 1, 0);

    // Completed project: everything done.
    insertStage.run(pLanding, 'Diseño', brunoId, daysFromNow(-30), null, daysFromNow(-25), daysFromNow(-24), 1, 1);
    insertStage.run(pLanding, 'Desarrollo', carlaId, daysFromNow(-23), null, daysFromNow(-16), daysFromNow(-15), 2, 1);
    insertStage.run(pLanding, 'Entrega', adminUserId, daysFromNow(-14), null, daysFromNow(-12), daysFromNow(-12), 3, 1);

    // Accessibility audit: not started yet.
    insertStage.run(pAuditoria, 'Relevamiento', adminUserId, null, null, daysFromNow(12), null, 1, 0);
    insertStage.run(pAuditoria, 'Entrega', adminUserId, null, null, daysFromNow(30), null, 2, 0);

    // ---- Stage tags ---------------------------------------------------------
    const insertStageTag = db.prepare(
      'INSERT INTO stage_tags (stage_id, tag_id) VALUES (?, ?)'
    );
    insertStageTag.run(sWebDev, tagUrgente);
    insertStageTag.run(sWebDev, tagRevision);
    insertStageTag.run(sIdentDiseno, tagUrgente);
    insertStageTag.run(sTurnosDiseno, tagBloqueado);

    // ---- Comments -----------------------------------------------------------
    // NOTE: seeded with direct SQL because POST /api/comments is broken upstream
    // (it never supplies comments.author, which is NOT NULL with no default).
    const insertComment = db.prepare(
      'INSERT INTO comments (stage_id, user_id, content, author) VALUES (?, ?, ?, ?)'
    );
    insertComment.run(sWebDev, carlaId, 'Falta integrar la pasarela de pagos.', 'Carla Desarrollo');
    insertComment.run(sWebDev, adminUserId, 'El cliente pidió sumar la sección de novedades.', DEMO_ACCOUNT_NAME);
    insertComment.run(sIdentDiseno, brunoId, 'Segunda ronda de logotipos enviada.', 'Bruno Diseño');
    insertComment.run(sWebDiseno, brunoId, 'Aprobado por el cliente sin cambios.', 'Bruno Diseño');

    // ---- Stage cycles -------------------------------------------------------
    const insertCycle = db.prepare(
      `INSERT INTO stage_cycles
       (organization_id, project_id, stage_id, cycle_number, started_at, started_by,
        ended_at, ended_by, deadline_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    insertCycle.run(orgId, pWeb, sWebRelev, 1, daysFromNow(-20), adminUserId, daysFromNow(-17), adminUserId, daysFromNow(-17));
    insertCycle.run(orgId, pWeb, sWebDev, 1, daysFromNow(-7), carlaId, null, null, daysFromNow(14));
    insertCycle.run(orgId, pIdentidad, sIdentRelev, 1, daysFromNow(-12), adminUserId, daysFromNow(-9), adminUserId, daysFromNow(-9));

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // ---- Report ---------------------------------------------------------------
  const counts = {};
  for (const table of [
    'accounts', 'organizations', 'users', 'clients', 'projects',
    'stages', 'stage_templates', 'tags', 'stage_tags', 'comments', 'stage_cycles',
  ]) {
    counts[table] = db.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;
  }
  db.close();

  console.log('\nDemo data seeded.');
  console.table(counts);
  console.log(`\nLogin: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Organization: ${DEMO_ORG}`);
}

main();
