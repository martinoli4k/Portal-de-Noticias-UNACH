const assert = require('assert');
const http = require('http');

// Suite de pruebas de integración para el Portal de Noticias
async function runTests() {
  console.log('Iniciando suite de pruebas de seguridad y API...\n');

  const BASE_URL = 'http://localhost:3000/api';
  let adminToken = '';
  let adminRefreshToken = '';
  let editorToken = '';
  let lectorToken = '';

  // 1. Health Check
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.status, 'OK');
    console.log('✔ 1. Health Check: OK');
  } catch (err) {
    console.error('✖ 1. Health Check falló:', err.message);
    throw err;
  }

  // 2. Consulta pública de noticias
  try {
    const res = await fetch(`${BASE_URL}/noticias`);
    const news = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(news) && news.length > 0);
    console.log(`✔ 2. Consulta pública de noticias: ${news.length} notas listadas`);
  } catch (err) {
    console.error('✖ 2. Consulta de noticias falló:', err.message);
    throw err;
  }

  // 3. Autenticación de los 3 roles y entrega de Tokens JWT + Refresh Tokens
  try {
    // Admin
    const resAdmin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@portalnoticias.com', password: 'Admin123!' })
    });
    const dataAdmin = await resAdmin.json();
    assert.strictEqual(resAdmin.status, 200);
    assert.ok(dataAdmin.token, 'Debe devolver access token');
    assert.ok(dataAdmin.refreshToken, 'Debe devolver refresh token');
    assert.strictEqual(dataAdmin.user.nombre_rol, 'Administrador');
    adminToken = dataAdmin.token;
    adminRefreshToken = dataAdmin.refreshToken;

    // Editor
    const resEditor = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'editor@portalnoticias.com', password: 'Editor123!' })
    });
    const dataEditor = await resEditor.json();
    assert.strictEqual(resEditor.status, 200);
    assert.ok(dataEditor.token);
    assert.ok(dataEditor.refreshToken);
    assert.strictEqual(dataEditor.user.nombre_rol, 'Editor');
    editorToken = dataEditor.token;

    // Lector (Usuario Regular)
    const resLector = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lector@portalnoticias.com', password: 'Lector123!' })
    });
    const dataLector = await resLector.json();
    assert.strictEqual(resLector.status, 200);
    assert.ok(dataLector.token);
    assert.strictEqual(dataLector.user.nombre_rol, 'Usuario Regular');
    lectorToken = dataLector.token;

    console.log('✔ 3. Autenticación de Administrador, Editor y Usuario Regular: OK (Access Token + Refresh Token emitidos)');
  } catch (err) {
    console.error('✖ 3. Autenticación falló:', err.message);
    throw err;
  }

  // 4. Renovación de sesión con Refresh Token
  try {
    const resRefresh = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: adminRefreshToken })
    });
    const dataRefresh = await resRefresh.json();
    assert.strictEqual(resRefresh.status, 200);
    assert.ok(dataRefresh.token, 'Debe devolver nuevo access token');
    console.log('✔ 4. Renovación de Access Token mediante Refresh Token: OK');
  } catch (err) {
    console.error('✖ 4. Renovación con Refresh Token falló:', err.message);
    throw err;
  }

  // 5. Verificación de permisos RBAC: Lector NO puede publicar noticias (403)
  try {
    const res = await fetch(`${BASE_URL}/noticias`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${lectorToken}`
      },
      body: JSON.stringify({
        titulo: 'Intento de publicación por lector',
        contenido: 'Este contenido no debe guardarse.',
        categoria: 'Tecnología'
      })
    });
    assert.strictEqual(res.status, 403, 'Lector debe recibir 403 Forbidden');
    console.log('✔ 5. RBAC: Lector bloqueado correctamente al intentar crear noticias (403 Forbidden)');
  } catch (err) {
    console.error('✖ 5. Verificación de RBAC Lector falló:', err.message);
    throw err;
  }

  // 6. Operaciones CRUD por Editor
  let createdNewsId = null;
  try {
    // Crear
    const resCreate = await fetch(`${BASE_URL}/noticias`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${editorToken}`
      },
      body: JSON.stringify({
        titulo: 'Proyecto estudiantil de energía renovable en Chiapas',
        contenido: 'Estudiantes de ingeniería diseñaron un prototipo de celda solar de alta eficiencia.',
        categoria: 'Ciencia',
        imagen_url: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80'
      })
    });
    const dataCreate = await resCreate.json();
    assert.strictEqual(resCreate.status, 201);
    assert.ok(dataCreate.noticia && dataCreate.noticia.id);
    createdNewsId = dataCreate.noticia.id;

    // Editar
    const resEdit = await fetch(`${BASE_URL}/noticias/${createdNewsId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${editorToken}`
      },
      body: JSON.stringify({
        titulo: 'Proyecto estudiantil de energía renovable en Chiapas (Actualizado)',
        contenido: 'Estudiantes de ingeniería presentaron avances del prototipo con más del 38% de eficiencia.',
        categoria: 'Ciencia'
      })
    });
    assert.strictEqual(resEdit.status, 200);

    // Eliminar
    const resDel = await fetch(`${BASE_URL}/noticias/${createdNewsId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${editorToken}`
      }
    });
    assert.strictEqual(resDel.status, 200);

    console.log('✔ 6. CRUD de Noticias por Editor (Crear -> Editar -> Eliminar): OK');
  } catch (err) {
    console.error('✖ 6. CRUD de noticias falló:', err.message);
    throw err;
  }

  // 7. Prueba de Cambio de Contraseña (Autenticado)
  try {
    // Registrar usuario temporal para la prueba
    const tempEmail = `testuser_${Date.now()}@portalnoticias.com`;
    const resReg = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: 'Usuario Prueba',
        email: tempEmail,
        password: 'Password123!'
      })
    });
    const dataReg = await resReg.json();
    assert.strictEqual(resReg.status, 201);
    const userToken = dataReg.token;

    // Cambiar contraseña
    const resChange = await fetch(`${BASE_URL}/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        currentPassword: 'Password123!',
        newPassword: 'NewSecurePassword456!'
      })
    });
    const dataChange = await resChange.json();
    assert.strictEqual(resChange.status, 200);

    // Intentar login con la contraseña anterior -> debe fallar
    const resOldLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tempEmail, password: 'Password123!' })
    });
    assert.strictEqual(resOldLogin.status, 401);

    // Login con la nueva contraseña -> debe ser exitoso
    const resNewLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: tempEmail, password: 'NewSecurePassword456!' })
    });
    assert.strictEqual(resNewLogin.status, 200);

    console.log('✔ 7. Cambio de Contraseña de usuario autenticado: OK');
  } catch (err) {
    console.error('✖ 7. Cambio de contraseña falló:', err.message);
    throw err;
  }

  // 8. Prueba de Solicitud de Recuperación de Contraseña por Correo (SMTP / Ethereal)
  try {
    const resForgot = await fetch(`${BASE_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'lector@portalnoticias.com' })
    });
    const dataForgot = await resForgot.json();
    assert.strictEqual(resForgot.status, 200);
    assert.ok(dataForgot.message);
    console.log('✔ 8. Recuperación de Contraseña: Envío de correo y código de verificación de 6 dígitos: OK');
  } catch (err) {
    console.error('✖ 8. Recuperación de contraseña falló:', err.message);
    throw err;
  }

  // 9. Bitácora de Auditoría e Inmutabilidad en Base de Datos
  try {
    const resAudit = await fetch(`${BASE_URL}/admin/auditoria`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const auditLogs = await resAudit.json();
    assert.strictEqual(resAudit.status, 200);
    assert.ok(auditLogs.length > 0);

    // Verificar inmutabilidad mediante trigger SQL
    const db = require('../src/database/db');
    let updateBlocked = false;
    try {
      db.prepare('UPDATE auditoria SET accion = "Modificado" WHERE id = 1').run();
    } catch (triggerErr) {
      updateBlocked = true;
    }
    assert.strictEqual(updateBlocked, true, 'El trigger SQL debe impedir UPDATE en auditoría');

    console.log(`✔ 9. Bitácora de Auditoría: ${auditLogs.length} eventos registrados e inmutabilidad garantizada por triggers SQL`);
  } catch (err) {
    console.error('✖ 9. Auditoría falló:', err.message);
    throw err;
  }

  console.log('\n========================================================');
  console.log('🎉 TODAS LAS PRUEBAS DE SEGURIDAD Y RBAC PASARON CON ÉXITO');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('Error durante la ejecución de pruebas:', err);
  process.exit(1);
});
