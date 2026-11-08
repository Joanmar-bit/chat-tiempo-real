// ====== Referencias al DOM ======
const estado = document.getElementById('estado');
const conectarBtn = document.getElementById('conectarBtn');
const desconectarBtn = document.getElementById('desconectarBtn');
const usuarioActualSpan = document.getElementById('usuarioActual');
const mensajes = document.getElementById('mensajes');
const mensajeInput = document.getElementById('mensajeInput');
const enviarBtn = document.getElementById('enviarBtn');
const listaUsuarios = document.getElementById('listaUsuarios');
const totalUsuarios = document.getElementById('totalUsuarios');

let socket = null;
let miEtiqueta = '';

// ====== Renderiza un evento recibido del servidor (objeto literal) ======
// evento = { tipo, usuario, hora, mensaje }
function agregarEvento(evento) {
  const div = document.createElement('div');
  div.classList.add('evento');

  switch (evento.tipo) {
    case 'conexion':
      div.classList.add('evento-conexion');
      div.innerHTML = `<span class="hora">[${evento.hora}]</span> 🟢 ${evento.mensaje}`;
      break;
    case 'desconexion':
      div.classList.add('evento-desconexion');
      div.innerHTML = `<span class="hora">[${evento.hora}]</span> 🔴 ${evento.mensaje}`;
      break;
    case 'mensaje':
      div.classList.add('evento-mensaje');
      div.innerHTML = `<span class="hora">[${evento.hora}]</span> <strong>${evento.usuario}:</strong> ${evento.mensaje}`;
      break;
    default:
      div.innerHTML = `<span class="hora">[${evento.hora}]</span> ${evento.mensaje}`;
      break;
  }

  mensajes.appendChild(div);
  mensajes.scrollTop = mensajes.scrollHeight;
}

// ====== Pinta la lista de usuarios conectados (arreglo + for) ======
function actualizarListaUsuarios(data) {
  listaUsuarios.innerHTML = '';
  const usuarios = data.usuarios;

  for (let i = 0; i < usuarios.length; i++) {
    const li = document.createElement('li');
    li.classList.add('list-group-item');
    li.textContent = usuarios[i];
    listaUsuarios.appendChild(li);
  }

  totalUsuarios.textContent = data.total;
}

// ====== Pedir el nombre de usuario, validando que no quede vacio ======
// Se usa do...while porque el bloque debe ejecutarse al menos una vez.
function pedirNombre() {
  let nombre = '';
  let intentos = 0;

  do {
    nombre = prompt('Ingresa tu nombre de usuario para entrar al chat:');
    intentos = intentos + 1;

    if (nombre === null) {
      nombre = ''; // el usuario cancelo el prompt
    }
    nombre = nombre.trim();

  } while (nombre === '' && intentos < 5);

  if (nombre === '') {
    nombre = 'Invitado';
  }

  return nombre;
}

const nombre = pedirNombre();

// ====== Conectar al servidor ======
function conectar() {
  try {
    socket = io();

    socket.on('connect', () => {
      estado.textContent = 'Conectado';
      estado.classList.remove('desconectado');
      estado.classList.add('conectado');
      conectarBtn.disabled = true;
      desconectarBtn.disabled = false;
      socket.emit('registrar', nombre);
    });

    socket.on('registro-ok', (data) => {
      miEtiqueta = data.etiqueta;
      usuarioActualSpan.textContent = miEtiqueta;
    });

    socket.on('disconnect', () => {
      estado.textContent = 'Desconectado';
      estado.classList.remove('conectado');
      estado.classList.add('desconectado');
      conectarBtn.disabled = false;
      desconectarBtn.disabled = true;
    });

    socket.on('evento', (data) => {
      agregarEvento(data);
    });

    socket.on('lista-usuarios', (data) => {
      actualizarListaUsuarios(data);
    });

    socket.on('error-servidor', (mensaje) => {
      alert(mensaje);
    });

  } catch (error) {
    console.error('Error al intentar conectar:', error.message);
  }
}

function desconectar() {
  if (socket !== null) {
    socket.disconnect();
  }
}

function enviarMensaje() {
  const texto = mensajeInput.value;
  if (socket !== null && socket.connected && texto.trim() !== '') {
    socket.emit('mensaje', texto);
    mensajeInput.value = '';
  }
}

conectarBtn.onclick = conectar;
desconectarBtn.onclick = desconectar;
enviarBtn.onclick = enviarMensaje;

mensajeInput.addEventListener('keypress', (evento) => {
  if (evento.key === 'Enter') {
    enviarMensaje();
  }
});
