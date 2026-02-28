// Carga de express.
const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const app = express();
const PORT = 3000;

// Rutas a ficheros.
const USERS_PATH = path.join(__dirname, "data", "usuarios.json");
const LOG_PATH = path.join(__dirname, "logs", "accesos.log");

// Contraseña fija.
const PASSWORD = "1234";

// Datos de sesiones disponibles.
const SESIONES = [
  { id: 1, nombre: "Viaje al Ser Interno", precio: 105.0 },
  { id: 2, nombre: "Meditación del Despertar", precio: 200.0 },
  { id: 3, nombre: "Conexión SupraConsciente", precio: 205.0 },
  { id: 4, nombre: "Descanso Mental Express", precio: 75.0 }
];

// Obteción de cookies.
function getCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;

  const cookies = header.split(";").map(c => c.trim());
  for (const c of cookies) {
    const [k, v] = c.split("=");
    if (k === name) return decodeURIComponent(v);
  }
  return null;
}

// Añade una línea al log.
function logAccion(req, accion) {
  const email = req.session?.usuario?.email || "anonimo";
  const linea = `[${new Date().toISOString()}] ${email} - ${accion} - ${req.method} ${req.path}\n`;
  fs.appendFile(LOG_PATH, linea, () => {});
}

// Obtiene usuarios desde JSON. Si no existen, devuelve [].
function leerUsuarios() {
  try {
    const txt = fs.readFileSync(USERS_PATH, "utf8");
    return JSON.parse(txt);
  } catch {
    return [];
  }
}

// Guarda usuarios en JSON
function guardarUsuarios(usuarios) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(usuarios, null, 2), "utf8");
}

// Validación de email
function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Middleware de protección: si no hay sesión, deniega acceso.
function requireLogin(req, res, next) {
  if (!req.session.usuario) {
    logAccion(req, "Acceso denegado (sin login)");
    return res.redirect("/login");
  }
  next();
}

// Middlewares base.
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));

// Cookie de sesión del servidor.
app.use(session({
  secret: "suenos_valenti_secret",
  resave: false,
  saveUninitialized: false
}));

// Variables globales para EJS (tema, usuario, helper euro)
app.use((req, res, next) => {
  res.locals.tema = getCookie(req, "tema") || "oscuro"; // "oscuro" por defecto
  res.locals.usuario = req.session.usuario || null;
  res.locals.euro = (n) => `${Number(n).toFixed(2)} €`;
  next();
});

// Rutas

// Inicio (GET "/")
app.get("/", (req, res) => {
  logAccion(req, "Visita inicio");
  res.render("inicio");
});

// Registro (GET + POST /registro)
app.get("/registro", (req, res) => {
  res.render("registro", {
    valores: { nombre: "", email: "", edad: "", ciudad: "", intereses: [] },
    errores: []
  });
});

app.post("/registro", (req, res) => {
  const { nombre, email, edad, ciudad } = req.body;

  let intereses = req.body.intereses || [];
  if (!Array.isArray(intereses)) intereses = [intereses];

  const errores = [];

  // Validaciones mínimas de nombre, email y edad.
  if (!nombre || nombre.trim().length < 3) errores.push("El nombre es obligatorio (mínimo 3 caracteres).");
  if (!email || !emailValido(email)) errores.push("El email no es válido.");
  if (!edad || Number(edad) < 18) errores.push("La edad debe ser mayor o igual a 18 años.");

  // Check de errores. Si hay alguno, muestra mensaje.
  if (errores.length) {
    logAccion(req, "Registro con errores");
    return res.status(400).render("registro", {
      valores: { nombre, email, edad, ciudad, intereses },
      errores
    });
  }

  // Guardado en JSON (data/usuarios.json)
  const usuarios = leerUsuarios();

  // Checkeo para evitar email duplicados.
  const existe = usuarios.some(u => u.email === email);
  if (existe) {
    errores.push("Ya existe un usuario con ese email.");
    logAccion(req, "Registro duplicado");
    return res.status(400).render("registro", {
      valores: { nombre, email, edad, ciudad, intereses },
      errores
    });
  }

  // Añade usuario.
  usuarios.push({
    nombre: nombre.trim(),
    email: email.trim().toLowerCase(),
    edad: Number(edad),
    ciudad: ciudad || "",
    intereses
  });

  // Guarda usuario.
  guardarUsuarios(usuarios);
  logAccion(req, "Registro correcto");

  // Tras registrar al usuario, redirección a login.
  res.redirect("/login");
});

// Login (GET + POST /login)
app.get("/login", (req, res) => {
  res.render("login", { error: "" });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const usuarios = leerUsuarios();
  const usuario = usuarios.find(u => u.email === (email || "").trim().toLowerCase());

  // Checkeo de password.
  if (!usuario || password !== PASSWORD) {
    logAccion(req, "Login fallido");
    return res.status(401).render("login", { error: "Credenciales incorrectas." });
  }

  // Guardar usuario en sesión
  req.session.usuario = usuario;

  // Inicio de carrito en sesión si no existe.
  if (!req.session.carrito) req.session.carrito = [];

  // Si sesión correcta, muestra mensaje y redige a perfil.
  logAccion(req, "Login correcto");
  res.redirect("/perfil");
});

// Perfil: zona privada para cada usuario.
app.get("/perfil", requireLogin, (req, res) => {
  logAccion(req, "Acceso a perfil");
  res.render("perfil");
});

// Logout (POST /logout)
app.post("/logout", requireLogin, (req, res) => {
  logAccion(req, "Logout");
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Preferencias (GET /preferencias)
// Cambia theme con query: /preferencias?tema=claro o /preferencias?tema=oscuro.
app.get("/preferencias", (req, res) => {
  const tema = req.query.tema;

  if (tema === "claro" || tema === "oscuro") {
    // Genera una cookie de 30 días.
    res.cookie("tema", tema, { maxAge: 30 * 24 * 60 * 60 * 1000 });
    logAccion(req, `Cambio de tema a ${tema}`);
    return res.redirect("/preferencias");
  }

  res.render("preferencias");
});

// Sesiones (zona privada + carrito en sesión).
app.get("/sesiones", requireLogin, (req, res) => {
  if (!req.session.carrito) req.session.carrito = [];

  // Total del carrito
  const total = req.session.carrito.reduce((acc, s) => acc + s.precio, 0);

  logAccion(req, "Acceso a sesiones");
  res.render("sesiones", {
    sesionesDisponibles: SESIONES,
    carrito: req.session.carrito,
    total
  });
});

// Añadir al carrito (POST)
app.post("/sesiones/add", requireLogin, (req, res) => {
  const id = Number(req.body.id);
  const sesion = SESIONES.find(s => s.id === id);

  if (sesion) {
    if (!req.session.carrito) req.session.carrito = [];
    req.session.carrito.push(sesion);
    logAccion(req, `Añade al carrito: ${sesion.nombre}`);
  }

  res.redirect("/sesiones");
});

// Eliminar un elemento del carrito (por índice)
app.post("/sesiones/eliminar", requireLogin, (req, res) => {
  const index = Number(req.body.index);

  if (!req.session.carrito) req.session.carrito = [];

  // Comprobación simple para evitar errores
  if (Number.isInteger(index) && index >= 0 && index < req.session.carrito.length) {
    const eliminado = req.session.carrito.splice(index, 1)[0];
    logAccion(req, `Elimina del carrito: ${eliminado.nombre}`);
  } else {
    logAccion(req, "Intento de eliminar índice inválido");
  }

  res.redirect("/sesiones");
});

// Vaciar carrito (POST)
app.post("/sesiones/vaciar", requireLogin, (req, res) => {
  req.session.carrito = [];
  logAccion(req, "Vacía carrito");
  res.redirect("/sesiones");
});

// Inicio del servidor.
app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
