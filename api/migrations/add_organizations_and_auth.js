const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🔄 Iniciando migración: Agregando sistema de organizaciones y autenticación...\n');

db.serialize(() => {
  // 1. Crear tabla de organizaciones
  console.log('1. Creando tabla organizations...');
  db.run(`
    CREATE TABLE IF NOT EXISTS organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('❌ Error al crear tabla organizations:', err);
    } else {
      console.log('✓ Tabla organizations creada');
    }
  });

  // 2. Crear organización por defecto y obtener su ID
  console.log('\n2. Creando organización por defecto...');
  db.run(`
    INSERT INTO organizations (name, created_at, updated_at)
    VALUES ('Empresa Principal', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `, function(err) {
    if (err) {
      console.error('❌ Error al crear organización por defecto:', err);
      return;
    }
    const defaultOrgId = this.lastID;
    console.log(`✓ Organización por defecto creada con ID: ${defaultOrgId}`);

    // 3. Agregar columna organization_id a la tabla users
    console.log('\n3. Modificando tabla users...');
    
    // Verificar si la columna ya existe
    db.all("PRAGMA table_info(users)", (err, columns) => {
      if (err) {
        console.error('❌ Error al obtener info de users:', err);
        return;
      }

      const hasOrgId = columns.some(col => col.name === 'organization_id');
      const hasPassword = columns.some(col => col.name === 'password_hash');
      const hasScopes = columns.some(col => col.name === 'scopes');

      if (!hasOrgId || !hasPassword || !hasScopes) {
        // Necesitamos recrear la tabla
        console.log('   Recreando tabla users con nuevas columnas...');
        
        // Obtener datos actuales
        db.all('SELECT * FROM users', (err, users) => {
          if (err) {
            console.error('❌ Error al leer usuarios:', err);
            return;
          }

          // Crear tabla temporal
          db.run(`
            CREATE TABLE users_new (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              organization_id INTEGER NOT NULL,
              name TEXT NOT NULL,
              email TEXT NOT NULL,
              password_hash TEXT,
              role TEXT DEFAULT 'user',
              scopes TEXT DEFAULT '[]',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
              UNIQUE(organization_id, email)
            )
          `, (err) => {
            if (err) {
              console.error('❌ Error al crear users_new:', err);
              return;
            }

            // Insertar datos existentes en la nueva tabla
            const stmt = db.prepare(`
              INSERT INTO users_new (id, organization_id, name, email, password_hash, role, scopes, created_at, updated_at)
              VALUES (?, ?, ?, ?, NULL, ?, '["admin"]', ?, ?)
            `);

            users.forEach(user => {
              stmt.run(
                user.id,
                defaultOrgId,
                user.name,
                user.email,
                user.role || 'user',
                user.created_at || new Date().toISOString(),
                user.updated_at || new Date().toISOString()
              );
            });

            stmt.finalize((err) => {
              if (err) {
                console.error('❌ Error al insertar datos:', err);
                return;
              }

              // Eliminar tabla vieja y renombrar
              db.run('DROP TABLE users', (err) => {
                if (err) {
                  console.error('❌ Error al eliminar tabla users:', err);
                  return;
                }

                db.run('ALTER TABLE users_new RENAME TO users', (err) => {
                  if (err) {
                    console.error('❌ Error al renombrar tabla:', err);
                  } else {
                    console.log(`✓ Tabla users actualizada (${users.length} usuarios migrados con scopes admin)`);
                    
                    // 4. Agregar columna organization_id a projects
                    migrateProjects(defaultOrgId);
                  }
                });
              });
            });
          });
        });
      } else {
        console.log('✓ Tabla users ya tiene las columnas necesarias');
        migrateProjects(defaultOrgId);
      }
    });
  });
});

function migrateProjects(defaultOrgId) {
  console.log('\n4. Modificando tabla projects...');
  
  db.all("PRAGMA table_info(projects)", (err, columns) => {
    if (err) {
      console.error('❌ Error al obtener info de projects:', err);
      db.close();
      return;
    }

    const hasOrgId = columns.some(col => col.name === 'organization_id');

    if (!hasOrgId) {
      // Obtener datos actuales
      db.all('SELECT * FROM projects', (err, projects) => {
        if (err) {
          console.error('❌ Error al leer proyectos:', err);
          db.close();
          return;
        }

        // Crear tabla temporal
        db.run(`
          CREATE TABLE projects_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active',
            client_id INTEGER,
            responsible_id INTEGER,
            deadline DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
            FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error al crear projects_new:', err);
            db.close();
            return;
          }

          // Insertar datos existentes
          const stmt = db.prepare(`
            INSERT INTO projects_new 
            (id, organization_id, name, description, status, client_id, responsible_id, deadline, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          projects.forEach(project => {
            stmt.run(
              project.id,
              defaultOrgId,
              project.name,
              project.description,
              project.status || 'active',
              project.client_id,
              project.responsible_id,
              project.deadline,
              project.created_at || new Date().toISOString(),
              project.updated_at || new Date().toISOString()
            );
          });

          stmt.finalize((err) => {
            if (err) {
              console.error('❌ Error al insertar datos:', err);
              db.close();
              return;
            }

            // Eliminar tabla vieja y renombrar
            db.run('DROP TABLE projects', (err) => {
              if (err) {
                console.error('❌ Error al eliminar tabla projects:', err);
                db.close();
                return;
              }

              db.run('ALTER TABLE projects_new RENAME TO projects', (err) => {
                if (err) {
                  console.error('❌ Error al renombrar tabla:', err);
                } else {
                  console.log(`✓ Tabla projects actualizada (${projects.length} proyectos migrados)`);
                }
                
                // 5. Migrar clientes
                migrateClients(defaultOrgId);
              });
            });
          });
        });
      });
    } else {
      console.log('✓ Tabla projects ya tiene organization_id');
      migrateClients(defaultOrgId);
    }
  });
}

function migrateClients(defaultOrgId) {
  console.log('\n5. Modificando tabla clients...');
  
  db.all("PRAGMA table_info(clients)", (err, columns) => {
    if (err) {
      console.error('❌ Error al obtener info de clients:', err);
      db.close();
      return;
    }

    const hasOrgId = columns.some(col => col.name === 'organization_id');

    if (!hasOrgId) {
      db.all('SELECT * FROM clients', (err, clients) => {
        if (err) {
          console.error('❌ Error al leer clientes:', err);
          db.close();
          return;
        }

        db.run(`
          CREATE TABLE clients_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            contact_info TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error al crear clients_new:', err);
            db.close();
            return;
          }

          const stmt = db.prepare(`
            INSERT INTO clients_new (id, organization_id, name, contact_info, created_at)
            VALUES (?, ?, ?, ?, ?)
          `);

          clients.forEach(client => {
            stmt.run(
              client.id,
              defaultOrgId,
              client.name,
              client.contact_info,
              client.created_at || new Date().toISOString()
            );
          });

          stmt.finalize((err) => {
            if (err) {
              console.error('❌ Error al insertar datos:', err);
              db.close();
              return;
            }

            db.run('DROP TABLE clients', (err) => {
              if (err) {
                console.error('❌ Error al eliminar tabla clients:', err);
                db.close();
                return;
              }

              db.run('ALTER TABLE clients_new RENAME TO clients', (err) => {
                if (err) {
                  console.error('❌ Error al renombrar tabla:', err);
                } else {
                  console.log(`✓ Tabla clients actualizada (${clients.length} clientes migrados)`);
                }
                
                migrateStageTemplates(defaultOrgId);
              });
            });
          });
        });
      });
    } else {
      console.log('✓ Tabla clients ya tiene organization_id');
      migrateStageTemplates(defaultOrgId);
    }
  });
}

function migrateStageTemplates(defaultOrgId) {
  console.log('\n6. Modificando tabla stage_templates...');
  
  db.all("PRAGMA table_info(stage_templates)", (err, columns) => {
    if (err) {
      console.error('❌ Error al obtener info de stage_templates:', err);
      db.close();
      return;
    }

    const hasOrgId = columns.some(col => col.name === 'organization_id');

    if (!hasOrgId) {
      db.all('SELECT * FROM stage_templates', (err, templates) => {
        if (err) {
          console.error('❌ Error al leer plantillas:', err);
          db.close();
          return;
        }

        db.run(`
          CREATE TABLE stage_templates_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            organization_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            estimated_duration_days INTEGER,
            order_number INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
          )
        `, (err) => {
          if (err) {
            console.error('❌ Error al crear stage_templates_new:', err);
            db.close();
            return;
          }

          const stmt = db.prepare(`
            INSERT INTO stage_templates_new (id, organization_id, name, description, estimated_duration_days, order_number, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `);

          templates.forEach(template => {
            stmt.run(
              template.id,
              defaultOrgId,
              template.name,
              template.description,
              template.estimated_duration_days,
              template.order_number,
              template.created_at || new Date().toISOString()
            );
          });

          stmt.finalize((err) => {
            if (err) {
              console.error('❌ Error al insertar datos:', err);
              db.close();
              return;
            }

            db.run('DROP TABLE stage_templates', (err) => {
              if (err) {
                console.error('❌ Error al eliminar tabla stage_templates:', err);
                db.close();
                return;
              }

              db.run('ALTER TABLE stage_templates_new RENAME TO stage_templates', (err) => {
                if (err) {
                  console.error('❌ Error al renombrar tabla:', err);
                } else {
                  console.log(`✓ Tabla stage_templates actualizada (${templates.length} plantillas migradas)`);
                }
                
                finalizeMigration();
              });
            });
          });
        });
      });
    } else {
      console.log('✓ Tabla stage_templates ya tiene organization_id');
      finalizeMigration();
    }
  });
}

function finalizeMigration() {
  console.log('\n' + '='.repeat(60));
  console.log('✅ MIGRACIÓN COMPLETADA EXITOSAMENTE');
  console.log('='.repeat(60));
  console.log('\nResumen:');
  console.log('• Tabla organizations creada');
  console.log('• Organización "Empresa Principal" creada');
  console.log('• Todos los usuarios migrados con scopes ["admin"]');
  console.log('• Todos los proyectos migrados a la organización principal');
  console.log('• Todos los clientes migrados a la organización principal');
  console.log('• Todas las plantillas migradas a la organización principal');
  console.log('\n⚠️  IMPORTANTE: Los usuarios no tienen contraseña asignada.');
  console.log('   Podrán iniciar sesión sin contraseña y configurarla después.');
  console.log('\n');

  db.close((err) => {
    if (err) {
      console.error('Error al cerrar la base de datos:', err);
    }
  });
}
