const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

// ===== Configuracion basica =====
const PORT = 3000;
const CLIENT_ORIGIN = '*'; // En producción conviene restringir al origen real del frontend

// ================================================================
// CLASE Usuario (POO)
// Representa a cada cliente conectado al chat.
// ================================================================
class Usuario {
  constructor(id, nombre) {
    this.id = id;                 // id del socket -> permite identificar de forma UNICA
    this.nombre = nombre;         // nombre elegido por el usuario (puede repetirse)
    this.fechaConexion = new Date();
  }

  // Etiqueta visible: combina el nombre con los ultimos 4 caracteres
  // del id de socket, para poder diferenciar usuarios con el mismo nombre.
  obtenerEtiqueta() {
    const sufijo = this.id.substring(this.id.length - 4);
    return `${this.nombre}#${sufijo}`;
  }
}

// ================================================================
// CLASE GestorUsuarios (POO)
// Administra la coleccion de usuarios conectados (objeto literal
// usado como diccionario id -> Usuario).
// ================================================================
class GestorUsuarios {
  constructor() {
    this.usuarios = {}; // objeto literal: { idSocket: Usuario }
  }

  agregar(id, nombre) {
    const usuario = new Usuario(id, nombre);
    this.usuarios[id] = usuario;
    return usuario;
  }

  obtener(id) {
    if (this.usuarios[id]) {
      return this.usuarios[id];
    }
    return null;
  }

  eliminar(id) {
    let usuarioEliminado = null;
    if (this.usuarios[id]) {
      usuarioEliminado = this.usuarios[id];
      delete this.usuarios[id];
    }
    return usuarioEliminado;
  }

  // Devuelve un arreglo con las etiquetas de todos los usuarios conectados
  listar() {
    const lista = [];
    for (const id in this.usuarios) {
      if (this.usuarios.hasOwnProperty(id)) {
        lista.push(this.usuarios[id].obtenerEtiqueta());
      }
    }
    return lista;
  }

  contar() {
    return Object.keys(this.usuarios).length;
  }
}

// ================================================================
// FUNCIONES AUXILIARES
// ================================================================

// Devuelve la fecha y hora actual formateada (se usa en todos los eventos)
function obtenerFechaHora() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('es-AR');
  const hora = ahora.toLocaleTimeString('es-AR');
  return `${fecha} ${hora}`;
}

// Traduce el motivo tecnico de desconexion que entrega Socket.IO
// a un mensaje legible para mostrar/loguear (estructura selectiva switch/case)
function traducirMotivoDesconexion(reason) {
  let motivo = '';

  switch (reason) {
    case 'client namespace disconnect':
      motivo = 'El usuario cerro la conexion manualmente (boton Desconectar)';
      break;
    case 'transport close':
      motivo = 'Se cerro la pestaña o el navegador / se perdio la red';
      break;
    case 'ping timeout':
      motivo = 'Se perdio la conexion con el cliente (timeout)';
      break;
    case 'transport error':
      motivo = 'Error de transporte / problema de red';
      break;
    case 'server namespace disconnect':
      motivo = 'El servidor cerro la conexion';
      break;
    default:
      motivo = 'Motivo no identificado (' + reason + ')';
      break;
  }

  return motivo;
}

const app = express();

// Middleware CORS
app.use(cors({
  origin: CLIENT_ORIGIN,
  methods: ['GET', 'POST']
}));

// El backend sirve el frontend estatico (carpeta public)
app.use(express.static('public'));

// Servidor HTTP sobre el que corre Socket.IO
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

// Instancia unica que administra a todos los usuarios conectados
const gestor = new GestorUsuarios();

// Manejo de conexiones WebSocket
io.on('connection', (socket) => {
  console.log(`🟢 Cliente conectado: ${socket.id}`);

  // El cliente pide registrarse con un nombre de usuario
  socket.on('registrar', (nombre) => {
    try {
      // Validacion basica del dato recibido (control de errores)
      let nombreValido = nombre;
      if (typeof nombre !== 'string' || nombre.trim() === '') {
        nombreValido = 'Anonimo';
      }
      nombreValido = nombreValido.trim();

      const usuario = gestor.agregar(socket.id, nombreValido);
      const fechaHora = obtenerFechaHora();

      console.log(`✅ ${usuario.obtenerEtiqueta()} se registro (${fechaHora})`);

      // Le informo al propio cliente cual es su etiqueta unica
      socket.emit('registro-ok', {
        etiqueta: usuario.obtenerEtiqueta(),
        hora: fechaHora
      });

      // Aviso a TODOS los clientes que un usuario ingreso al chat
      io.emit('evento', {
        tipo: 'conexion',
        usuario: usuario.obtenerEtiqueta(),
        hora: fechaHora,
        mensaje: `${usuario.obtenerEtiqueta()} se unio al chat`
      });

      // Actualizo la lista de usuarios conectados para todos
      io.emit('lista-usuarios', {
        usuarios: gestor.listar(),
        total: gestor.contar()
      });

    } catch (error) {
      console.error('⚠️ Error al registrar usuario:', error.message);
      socket.emit('error-servidor', 'No se pudo completar el registro');
    }
  });

  // El cliente envia un mensaje de chat
  socket.on('mensaje', (data) => {
    try {
      const usuario = gestor.obtener(socket.id);
      if (usuario === null) {
        socket.emit('error-servidor', 'Debes registrarte antes de enviar mensajes');
        return;
      }

      let texto = data;
      if (typeof texto !== 'string' || texto.trim() === '') {
        return; // se ignoran mensajes vacios
      }
      texto = texto.trim();

      const fechaHora = obtenerFechaHora();
      console.log(`📩 Mensaje de ${usuario.obtenerEtiqueta()}: ${texto} (${fechaHora})`);

      // Se reenvia a TODOS los clientes conectados (incluido el emisor)
      io.emit('evento', {
        tipo: 'mensaje',
        usuario: usuario.obtenerEtiqueta(),
        hora: fechaHora,
        mensaje: texto
      });

    } catch (error) {
      console.error('⚠️ Error al procesar el mensaje:', error.message);
    }
  });

  // El cliente se desconecta (cierre de pestaña, navegador, boton, timeout, etc.)
  socket.on('disconnect', (reason) => {
    try {
      const usuario = gestor.eliminar(socket.id);
      const fechaHora = obtenerFechaHora();
      const motivo = traducirMotivoDesconexion(reason);

      let etiqueta = 'Desconocido';
      if (usuario !== null) {
        etiqueta = usuario.obtenerEtiqueta();
      }

      // Requisito: identificar el motivo de desconexion desde el servidor
      // e imprimirlo por consola junto con el usuario, fecha y hora.
      console.log(`🔴 ${etiqueta} se desconecto (${fechaHora}) - Motivo: ${motivo}`);

      io.emit('evento', {
        tipo: 'desconexion',
        usuario: etiqueta,
        hora: fechaHora,
        mensaje: `${etiqueta} abandono el chat (${motivo})`
      });

      io.emit('lista-usuarios', {
        usuarios: gestor.listar(),
        total: gestor.contar()
      });

    } catch (error) {
      console.error('⚠️ Error al procesar la desconexion:', error.message);
    }
  });

  // Manejo basico de errores del socket
  socket.on('error', (error) => {
    console.error(`⚠️ Error en el socket ${socket.id}:`, error);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
