// ================== ESTADO ==================
let categoriaCache = [];
let detalleCache = []; // filas de detalle_venta
let ventasCache = []; // filas de ventas (con foto)

// ================== UTILIDADES ==================
// Evita que un nombre o descripción con HTML se ejecute al pintarlo (XSS)
function escaparHTML(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Muestra montos siempre con 2 decimales (evita $0.30000000000000004)
function formatoMonto(valor) {
  return "Bs. " + Number(valor).toFixed(2);
}

function totalCategoria(idCategoria) {
  return detalleCache
    .filter((d) => Number(d.id_categoria) === Number(idCategoria))
    .reduce((suma, d) => suma + Number(d.subtotal), 0);
}

function nombreCategoria(idCategoria) {
  const c = categoriaCache.find(
    (c) => Number(c.id_categoria) === Number(idCategoria),
  );
  return c ? c.nombre : "—";
}

async function obtenerIdUsuario() {
  const {
    data: { user },
  } = await sup.auth.getUser();
  if (!user) return null;

  const { data, error } = await sup
    .from("usuario")
    .select("id_usuario")
    .eq("correo_electronico", user.email)
    .maybeSingle();

  if (error) {
    console.error("Error al buscar usuario:", error);
    return null;
  }
  return data ? data.id_usuario : null;
}

// Sube una imagen al bucket "fotos-ventas" y devuelve su URL pública
async function subirFoto(archivo, carpeta) {
  if (!archivo.type.startsWith("image/")) return { error: "El archivo debe ser una imagen." };
  if (archivo.size > 5 * 1024 * 1024) return { error: "La foto pesa más de 5 MB. Elige una más liviana." };
  const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ruta = carpeta + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + (ext || "jpg");
  const { error } = await sup.storage.from("fotos-ventas").upload(ruta, archivo, { contentType: archivo.type });
  if (error) {
    console.error("Error al subir foto:", error);
    return { error: "No se pudo subir la foto." };
  }
  return { url: sup.storage.from("fotos-ventas").getPublicUrl(ruta).data.publicUrl };
}

function urlSegura(url) {
  return url && String(url).startsWith("https://") ? url : "";
}

// ================== PINTAR ==================
function llenarSelect() {
  const select = document.querySelector("#campo-categoria");
  select.innerHTML =
    '<option value="">Elige una categoría</option>' +
    categoriaCache
      .map(
        (c) =>
          `<option value="${c.id_categoria}">${escaparHTML(c.nombre)}</option>`,
      )
      .join("");
}

function claveMes(iso) {
  const f = new Date(iso); // usa la hora local del navegador
  return f.getFullYear() + "-" + String(f.getMonth() + 1).padStart(2, "0");
}

function pintarTablaVentas() {
  const tbody = document.querySelector("#cuerpo-ventas");
  if (detalleCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">Todavía no hay ventas registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = detalleCache
    .map((d) => {
      const v = ventasCache.find((v) => Number(v.id_venta) === Number(d.id_venta));
      const url = v && v.foto_url && v.foto_url.startsWith("https://") ? v.foto_url : "";
      const foto = url
        ? `<a href="${escaparHTML(url)}" target="_blank" rel="noopener noreferrer"><img class="miniatura" src="${escaparHTML(url)}" alt="Foto de la venta" loading="lazy" /></a>`
        : "—";
      return `
      <tr>
        <td>${new Date(d.created_at).toLocaleDateString("es-BO")}</td>
        <td>${escaparHTML(nombreCategoria(d.id_categoria))}</td>
        <td>${formatoMonto(d.subtotal)}</td>
        <td>${foto}</td>
      </tr>`;
    })
    .join("");
}

// Suma de ventas del mes elegido, total y por categoría
function pintarResumenMes() {
  const mes = document.querySelector("#campo-mes").value; // "AAAA-MM"
  const caja = document.querySelector("#resumen-mes");
  if (!mes) { caja.innerHTML = ""; return; }
  const delMes = detalleCache.filter((d) => claveMes(d.created_at) === mes);
  const total = delMes.reduce((suma, d) => suma + Number(d.subtotal), 0);
  const porCategoria = {};
  delMes.forEach((d) => {
    const n = nombreCategoria(d.id_categoria);
    porCategoria[n] = (porCategoria[n] || 0) + Number(d.subtotal);
  });
  const filas = Object.entries(porCategoria)
    .sort((a, b) => b[1] - a[1])
    .map(([n, v]) => `<tr><td>${escaparHTML(n)}</td><td>${formatoMonto(v)}</td></tr>`)
    .join("");
  caja.innerHTML =
    `<p class="total-mes">${formatoMonto(total)}</p>` +
    `<p class="suave">${delMes.length} venta(s) este mes</p>` +
    (filas ? `<table><thead><tr><th>Categoría</th><th>Vendido</th></tr></thead><tbody>${filas}</tbody></table>` : "");
}
document.querySelector("#campo-mes").addEventListener("change", pintarResumenMes);

function pintarTablaCategorias() {
  const tbody = document.querySelector("#cuerpo-categorias");
  if (categoriaCache.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5">Todavía no hay categorías registradas.</td></tr>';
    return;
  }
  tbody.innerHTML = categoriaCache
    .map(
      (c) => `
      <tr>
        <td>${urlSegura(c.foto_url) ? `<img class="miniatura" src="${escaparHTML(c.foto_url)}" alt="Referencia de ${escaparHTML(c.nombre)}" loading="lazy" />` : "—"}</td>
        <td>${escaparHTML(c.nombre)}</td>
        <td>${escaparHTML(c.descripcion)}</td>
        <td>${formatoMonto(totalCategoria(c.id_categoria))}</td>
        <td>
          <button class="btn-editar" data-id="${c.id_categoria}">Editar</button>
          <button class="btn-eliminar" data-id="${c.id_categoria}">Eliminar</button>
        </td>
      </tr>`,
    )
    .join("");
}

// Dibuja objetos como pilas de capas, como en una impresión 3D
function capas(perfil, n, alto, ancho) {
  const gap = alto / n;
  let s = "";
  for (let i = 0; i < n; i++) {
    const w = perfil(i / (n - 1));
    s += `<rect x="${(ancho / 2 - w / 2).toFixed(1)}" y="${(i * gap).toFixed(1)}" width="${w.toFixed(1)}" height="${(gap - 1.4).toFixed(1)}" rx="1.5" fill="${i % 2 ? "#4F7F5A" : "#2F4A3A"}" style="animation-delay:${i * 25}ms"/>`;
  }
  return s;
}

function dibujarJarron() {
  document.querySelector("#jarron").innerHTML = capas(
    (t) => 70 + 58 * Math.sin(Math.PI * (t * 0.9 + 0.05)) * (1 - 0.35 * t) + (t < 0.06 ? -20 : 0),
    52, 258, 200,
  );
}

const WHATSAPP = "NUMERO"; // tu número con código de país, sin +

// Catálogo público: muestra las categorías
function pintarGaleria() {
  const cont = document.querySelector("#catalogo");
  if (categoriaCache.length === 0) {
    cont.innerHTML = "<p class=\"texto\">Pronto publicaremos nuestras piezas.</p>";
    return;
  }
  cont.innerHTML = categoriaCache
    .map((c, i) => {
      const texto = encodeURIComponent("Hola, quiero cotizar: " + c.nombre);
      return `
      <article class="tarjeta">
        <div class="imagen">${urlSegura(c.foto_url)
          ? `<img src="${escaparHTML(c.foto_url)}" alt="${escaparHTML(c.nombre)}" loading="lazy" />`
          : `<svg viewBox="0 0 100 100" aria-hidden="true">${capas((t) => 26 + 24 * Math.abs(Math.sin(t * (2 + i))), 18, 90, 100)}</svg>`}</div>
        <div class="tarjeta-info">
          <h3>${escaparHTML(c.nombre)}</h3>
          <p>${escaparHTML(c.descripcion)}</p>
          <a class="boton" href="https://wa.me/${WHATSAPP}?text=${texto}" target="_blank" rel="noopener noreferrer">Cotizar</a>
        </div>
      </article>`;
    })
    .join("");
}

async function cargarCatalogoPublico() {
  const { data, error } = await sup.from("categoria").select("*").order("id_categoria");
  if (error) {
    console.error("Error al cargar catálogo:", error);
    return;
  }
  categoriaCache = data;
  pintarGaleria();
}

// ================== CARGAR DATOS ==================
async function cargarTodo() {
  const [cat, det, ven] = await Promise.all([
    sup.from("categoria").select("*").order("id_categoria"),
    sup.from("detalle_venta").select("*").order("created_at", { ascending: false }),
    sup.from("ventas").select("*"),
  ]);

  if (cat.error || det.error || ven.error) {
    console.error("Error al cargar datos:", cat.error || det.error || ven.error);
    document.querySelector("#mensaje-venta").textContent =
      "No se pudieron cargar los datos. Recarga la página.";
    return;
  }

  categoriaCache = cat.data;
  detalleCache = det.data;
  ventasCache = ven.data;

  llenarSelect();
  pintarTablaVentas();
  pintarResumenMes();
  pintarTablaCategorias();
  pintarGaleria();
}

// ================== PESTAÑAS ==================
function activarPestana(nombre) {
  document.querySelectorAll(".pestana").forEach((boton) => {
    const activa = boton.dataset.tab === nombre;
    boton.classList.toggle("activa", activa);
    boton.setAttribute("aria-selected", activa);
  });

  document.querySelectorAll(".panel-pestana").forEach((panel) => {
    panel.hidden = panel.id !== "tab-" + nombre;
  });
}

document.querySelector("#menu-pestanas").addEventListener("click", (event) => {
  const boton = event.target.closest(".pestana");
  if (boton) activarPestana(boton.dataset.tab);
});

// ================== VENTAS ==================
document
  .querySelector("#form-venta")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const id_categoria = Number(document.querySelector("#campo-categoria").value);
    const subtotal = Number(document.querySelector("#campo-precio").value);
    const archivo = document.querySelector("#campo-foto").files[0];
    const mensaje = document.querySelector("#mensaje-venta");

    if (!id_categoria) { mensaje.textContent = "Elige una categoría."; return; }
    if (!(subtotal > 0)) { mensaje.textContent = "Ingresa un monto válido."; return; }
    if (archivo && !archivo.type.startsWith("image/")) {
      mensaje.textContent = "El archivo debe ser una imagen."; return;
    }
    if (archivo && archivo.size > 5 * 1024 * 1024) {
      mensaje.textContent = "La foto pesa más de 5 MB. Elige una más liviana."; return;
    }

    const boton = event.target.querySelector("button[type=submit]");
    boton.disabled = true;
    try {
      const id_usuario = await obtenerIdUsuario();
      if (!id_usuario) {
        mensaje.textContent = "Tu cuenta no está registrada en la tabla usuario.";
        return;
      }

      // 0) Foto (opcional) en Supabase Storage
      let foto_url = null;
      if (archivo) {
        const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const ruta = Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + (ext || "jpg");
        const { error: errFoto } = await sup.storage
          .from("fotos-ventas")
          .upload(ruta, archivo, { contentType: archivo.type });
        if (errFoto) {
          console.error("Error al subir foto:", errFoto);
          mensaje.textContent = "No se pudo subir la foto.";
          return;
        }
        foto_url = sup.storage.from("fotos-ventas").getPublicUrl(ruta).data.publicUrl;
      }

      // 1) Cabecera de la venta
      const { data: venta, error: errVenta } = await sup
        .from("ventas")
        .insert({ total: subtotal, id_usuario, canal: "instagram", foto_url })
        .select()
        .single();
      if (errVenta) {
        console.error("Error al insertar venta:", errVenta);
        mensaje.textContent = "Error al registrar la venta.";
        return;
      }

      // 2) Línea de detalle
      const { error: errDetalle } = await sup
        .from("detalle_venta")
        .insert({ id_venta: venta.id_venta, id_categoria, subtotal });
      if (errDetalle) {
        console.error("Error al insertar detalle:", errDetalle);
        await sup.from("ventas").delete().eq("id_venta", venta.id_venta);
        mensaje.textContent = "Error al registrar la venta.";
        return;
      }

      mensaje.textContent = "Venta registrada ✔";
      event.target.reset();
      await cargarTodo();
    } finally {
      boton.disabled = false;
    }
  });

// ================== NUEVA CATEGORÍA ==================
document.querySelector("#form-nueva-categoria").addEventListener("submit", async (event) => {
  event.preventDefault();
  const nombre = document.querySelector("#nueva-nombre").value.trim();
  const descripcion = document.querySelector("#nueva-descripcion").value.trim();
  const archivo = document.querySelector("#nueva-foto").files[0];
  const mensaje = document.querySelector("#mensaje-categoria");
  if (!nombre) { mensaje.textContent = "Escribe el nombre."; return; }

  const boton = event.target.querySelector("button[type=submit]");
  boton.disabled = true;
  try {
    let foto_url = null;
    if (archivo) {
      const r = await subirFoto(archivo, "categorias");
      if (r.error) { mensaje.textContent = r.error; return; }
      foto_url = r.url;
    }
    const { error } = await sup.from("categoria").insert({ nombre, descripcion, foto_url });
    if (error) {
      console.error("Error al crear categoría:", error);
      mensaje.textContent = "No se pudo crear la categoría.";
      return;
    }
    mensaje.textContent = "Categoría creada ✔";
    event.target.reset();
    await cargarTodo();
  } finally {
    boton.disabled = false;
  }
});

// ================== EDITAR / ELIMINAR CATEGORÍAS ==================
document
  .querySelector("#cuerpo-categorias")
  .addEventListener("click", async (event) => {
    const id = Number(event.target.dataset.id);
    if (!id) return;

    if (event.target.classList.contains("btn-editar")) {
      const c = categoriaCache.find((c) => Number(c.id_categoria) === id);
      if (!c) return;
      document.querySelector("#editar-id").value = c.id_categoria;
      document.querySelector("#editar-nombre").value = c.nombre;
      document.querySelector("#editar-descripcion").value = c.descripcion || "";
      document.querySelector("#panel-edicion").style.display = "block";
      return;
    }

    if (event.target.classList.contains("btn-eliminar")) {
      const confirmado = window.confirm(
        "¿Estás seguro de eliminar esta categoría?",
      );
      if (!confirmado) return;

      const { error } = await sup
        .from("categoria")
        .delete()
        .eq("id_categoria", id);

      if (error) {
        console.error("Error al eliminar categoría:", error);
        if (error.code === "23503") {
          window.alert(
            "No se puede eliminar: la categoría tiene ventas registradas.",
          );
        } else {
          window.alert("No se pudo eliminar la categoría.");
        }
        return;
      }
      await cargarTodo();
    }
  });

document
  .querySelector("#form-editar-categoria")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = Number(document.querySelector("#editar-id").value);
    const nombre = document.querySelector("#editar-nombre").value.trim();
    const descripcion = document
      .querySelector("#editar-descripcion")
      .value.trim();

    if (!nombre) {
      window.alert("El nombre de la categoría no puede quedar vacío.");
      return;
    }

    const cambios = { nombre, descripcion };
    const archivo = document.querySelector("#editar-foto").files[0];
    if (archivo) {
      const r = await subirFoto(archivo, "categorias");
      if (r.error) { window.alert(r.error); return; }
      cambios.foto_url = r.url;
      document.querySelector("#editar-foto").value = "";
    }

    const { error } = await sup
      .from("categoria")
      .update(cambios)
      .eq("id_categoria", id);

    if (error) {
      console.error("Error al actualizar categoría:", error);
      window.alert("No se pudo guardar la categoría.");
      return;
    }

    document.querySelector("#panel-edicion").style.display = "none";
    await cargarTodo();
  });

// ================== AUTENTICACIÓN ==================
// Comprueba que el usuario con sesión tenga rol de administrador
// en la tabla usuario (buscado por su correo).
async function esAdmin() {
  const {
    data: { user },
  } = await sup.auth.getUser();
  if (!user) return false;

  const { data, error } = await sup
    .from("usuario")
    .select("rol")
    .eq("correo_electronico", user.email)
    .maybeSingle();
  if (error) {
    console.error("Error al verificar rol:", error);
    return false;
  }
  return !!data && String(data.rol).trim().toLowerCase() === "administrador";
}

function mostrarVista(nombre) {
  document.querySelector("#sitio").hidden = nombre !== "sitio";
  document.querySelector("#seccion-login").hidden = nombre !== "login";
  document.querySelector("#seccion-app").hidden = nombre !== "app";
  window.scrollTo(0, 0);
}
function mostrarSitio() { mostrarVista("sitio"); cargarCatalogoPublico(); }
function mostrarLogin() { mostrarVista("login"); }
function mostrarApp() {
  mostrarVista("app");
  activarPestana("ventas");
  cargarTodo();
}

document
  .querySelector("#form-login")
  .addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.querySelector("#login-email").value;
    const password = document.querySelector("#login-password").value;

    const { error } = await sup.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Error al iniciar sesión:", error);
      document.querySelector("#mensaje-login").textContent =
        "Error: " + error.message;
      return;
    }
    if (!(await esAdmin())) {
      await sup.auth.signOut();
      document.querySelector("#mensaje-login").textContent =
        "Esta cuenta no tiene permisos de administrador.";
      return;
    }

    document.querySelector("#mensaje-login").textContent = "";
    mostrarApp();
  });

document
  .querySelector("#btn-cerrar-sesion")
  .addEventListener("click", async () => {
    await sup.auth.signOut();
    // limpiar datos en memoria para que no queden a la vista del siguiente usuario
    categoriaCache = [];
    detalleCache = [];
    ventasCache = [];
    document.querySelector("#panel-edicion").style.display = "none";
    document.querySelector("#mensaje-venta").textContent = "";
    mostrarSitio();
  });

// ================== INICIO ==================
document.querySelector("#btn-admin").addEventListener("click", async () => {
  const { data: { session } } = await sup.auth.getSession();
  if (session && (await esAdmin())) mostrarApp();
  else mostrarLogin();
});
document.querySelector("#btn-volver").addEventListener("click", mostrarSitio);
document.querySelector("#btn-ver-sitio").addEventListener("click", mostrarSitio);

function iniciar() {
  dibujarJarron();
  document.querySelector("#campo-mes").value = claveMes(new Date().toISOString());
  mostrarSitio(); // el sitio es público: no exige sesión
}
iniciar();
