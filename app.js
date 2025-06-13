let direcciones = JSON.parse(localStorage.getItem("entregas")) || [];
let mapa;
let marcadores = [];
let marcadorUsuario = null;

window.onload = () => {
  mapa = L.map('mapa').setView([0, 0], 2);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mapa);

  direcciones.forEach(d => agregarMarcador(d));
  mostrarDirecciones();
};

document.getElementById("agregar").onclick = async () => {
  const input = document.getElementById("direccion");
  const direccion = input.value.trim();
  if (!direccion) return;

  const datos = await geocodificar(direccion);
  if (datos) {
    datos.entregado = false;
    datos.alertado = false;
    direcciones.push(datos);
    guardarLocal();
    agregarMarcador(datos);
    mostrarDirecciones();
    input.value = "";
  } else {
    alert("No se pudo geocodificar.");
  }
};

document.getElementById("iniciar-gps").onclick = () => {
  if (!navigator.geolocation) {
    alert("Geolocalización no disponible");
    return;
  }

  const audio = new Audio("sonido.mp3");

  navigator.geolocation.watchPosition((pos) => {
    const { latitude, longitude } = pos.coords;

    if (!marcadorUsuario) {
      marcadorUsuario = L.marker([latitude, longitude], {
        icon: L.icon({
          iconUrl: "https://cdn-icons-png.flaticon.com/512/61/61168.png",
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        })
      }).addTo(mapa).bindPopup("Tú estás aquí").openPopup();
    } else {
      marcadorUsuario.setLatLng([latitude, longitude]);
    }

    direcciones.forEach((d, i) => {
      const dist = calcularDistancia(latitude, longitude, d.lat, d.lng);
      if (dist < 100 && !d.alertado) {
        audio.play().catch(() => {});
        const confirmar = confirm(`Estás cerca de: ${d.direccion}.\n¿Se entregó el paquete?`);
        d.alertado = true;
        if (confirmar) {
          alert(`Marca "${d.direccion}" como entregada usando el botón.`);
        }
      }
    });

    guardarLocal();
    mostrarDirecciones();
  }, console.error, { enableHighAccuracy: true });
};

function mostrarDirecciones() {
  const contenedor = document.getElementById("lista-direcciones");
  contenedor.innerHTML = "";
  direcciones.forEach((d, i) => {
    const card = document.createElement("div");
    card.className = "entrega-card";
    card.innerHTML = `
      <strong>${d.direccion}</strong><br>
      <button class="btn btn-danger btn-sm mt-2" onclick="marcarEntregada(${i})">Marcar como Entregada</button>
    `;
    contenedor.appendChild(card);
  });
}

function marcarEntregada(index) {
  if (confirm(`¿Marcar "${direcciones[index].direccion}" como entregada?`)) {
    mapa.removeLayer(marcadores[index]);
    direcciones.splice(index, 1);
    marcadores.splice(index, 1);
    guardarLocal();
    mostrarDirecciones();
  }
}

function guardarLocal() {
  localStorage.setItem("entregas", JSON.stringify(direcciones));
}

function agregarMarcador(d) {
  let marker = L.marker([d.lat, d.lng]).addTo(mapa).bindPopup(d.direccion);
  marcadores.push(marker);
  mapa.setView([d.lat, d.lng], 14);
}

async function geocodificar(direccion) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(direccion)}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.length > 0) {
    return {
      direccion,
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon)
    };
  }
  return null;
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
