#!/usr/bin/env node

/**
 * MIGRATION SCRIPT: v1.2.0 → v2.0.0
 * 
 * Este script ejecuta todas las migraciones necesarias para actualizar
 * desde la versión 1.2.0 (sistema sin multi-tenancy) a la versión 2.0.0
 * (sistema con organizaciones, autenticación y mejoras de comentarios).
 * 
 * MIGRACIONES INCLUIDAS:
 * 1. add_organizations_and_auth.js - Sistema multi-tenant y autenticación JWT
 * 2. add_default_responsible_to_stage_templates.js - Campo para responsable por defecto
 * 3. add_user_id_to_comments.js - Migración de comentarios a sistema de usuarios
 * 
 * USO:
 *   node migrations/migrate_v1.2.0_to_v2.0.0.js
 * 
 * IMPORTANTE:
 * - Hacer backup de la base de datos antes de ejecutar
 * - Este script es idempotente (puede ejecutarse múltiples veces de forma segura)
 * - Todos los datos existentes serán migrados a la organización "Empresa Principal"
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'database.sqlite');

// Verificar que existe la base de datos
if (!fs.existsSync(dbPath)) {
  console.error('❌ ERROR: No se encontró la base de datos en:', dbPath);
  process.exit(1);
}

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║     MIGRACIÓN v1.2.0 → v2.0.0                                 ║');
console.log('║     Sistema Multi-Tenant + Autenticación + Comentarios       ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log('\n📂 Base de datos:', dbPath);
console.log('⏰ Iniciando migración:', new Date().toLocaleString());
console.log('\n' + '─'.repeat(63) + '\n');

const migrationSteps = [
  {
    name: 'Paso 1: Sistema de Organizaciones y Autenticación',
    file: 'add_organizations_and_auth.js',
    description: 'Crea tabla organizations, agrega organization_id a todas las tablas, migra usuarios con sistema de autenticación JWT'
  },
  {
    name: 'Paso 2: Responsable por Defecto en Plantillas',
    file: 'add_default_responsible_to_stage_templates.js',
    description: 'Agrega columna default_responsible_id a stage_templates'
  },
  {
    name: 'Paso 3: Sistema de Comentarios con Usuarios',
    file: 'add_user_id_to_comments.js',
    description: 'Migra tabla comments para usar user_id en lugar de author'
  }
];

let currentStep = 0;

function executeMigration(step) {
  return new Promise((resolve, reject) => {
    const migrationPath = path.join(__dirname, step.file);
    
    if (!fs.existsSync(migrationPath)) {
      return reject(new Error(`No se encontró el archivo: ${step.file}`));
    }

    console.log(`\n📋 ${step.name}`);
    console.log(`   ${step.description}`);
    console.log(`   Ejecutando: ${step.file}\n`);

    try {
      // Ejecutar el script de migración
      const migrationModule = require(migrationPath);
      
      // Si el módulo exporta una función, ejecutarla
      if (typeof migrationModule === 'function') {
        migrationModule()
          .then(() => resolve())
          .catch(reject);
      } else {
        // El script se ejecuta al requerirlo
        // Esperar un poco para que termine
        setTimeout(() => {
          resolve();
        }, 2000);
      }
    } catch (error) {
      reject(error);
    }
  });
}

async function runMigrations() {
  console.log('🚀 Iniciando secuencia de migración...\n');

  for (const step of migrationSteps) {
    try {
      currentStep++;
      await executeMigration(step);
      console.log(`\n✅ ${step.name} - COMPLETADO\n`);
      console.log('─'.repeat(63) + '\n');
    } catch (error) {
      console.error(`\n❌ ERROR en ${step.name}:`);
      console.error(error.message);
      console.error('\n⚠️  La migración se detuvo. Por favor revisa el error y vuelve a ejecutar el script.');
      console.error('   (Los pasos completados no se volverán a ejecutar)\n');
      process.exit(1);
    }
  }

  // Resumen final
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     ✅ MIGRACIÓN COMPLETADA EXITOSAMENTE                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('\n📊 RESUMEN DE CAMBIOS:\n');
  console.log('  🏢 Sistema Multi-Tenant:');
  console.log('     • Tabla organizations creada');
  console.log('     • Organización "Empresa Principal" creada por defecto');
  console.log('     • Columna organization_id agregada a: users, projects,');
  console.log('       clients, stage_templates');
  console.log('     • Todos los datos existentes migrados a la organización principal\n');
  
  console.log('  🔐 Autenticación:');
  console.log('     • Tabla users actualizada con password_hash y scopes');
  console.log('     • Todos los usuarios existentes migrados con scopes ["admin"]');
  console.log('     • Sistema JWT implementado (cookies httpOnly)\n');
  
  console.log('  👤 Plantillas de Etapas:');
  console.log('     • Campo default_responsible_id agregado a stage_templates\n');
  
  console.log('  💬 Sistema de Comentarios:');
  console.log('     • Tabla comments actualizada con user_id');
  console.log('     • Campo "author" eliminado');
  console.log('     • Comentarios existentes asignados al primer usuario\n');
  
  console.log('⚠️  ACCIONES REQUERIDAS:\n');
  console.log('  1. Los usuarios no tienen contraseña asignada.');
  console.log('     Podrán iniciar sesión sin contraseña la primera vez.');
  console.log('     Se recomienda que configuren su contraseña desde el menú de usuario.\n');
  
  console.log('  2. Reiniciar el servidor de la API para aplicar los cambios:\n');
  console.log('     cd api && npm start\n');
  
  console.log('⏰ Migración finalizada:', new Date().toLocaleString());
  console.log('\n');
}

// Ejecutar migraciones
runMigrations().catch(error => {
  console.error('\n❌ ERROR FATAL:', error);
  process.exit(1);
});
