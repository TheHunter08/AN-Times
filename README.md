# TIMES INC — Control Horario Laboral

PWA de control horario con GPS, Firebase Auth, roles y panel de administración.

## 🚀 Deploy en Vercel

```bash
# 1. Instala Vercel CLI
npm i -g vercel

# 2. Desde la carpeta del proyecto
vercel

# 3. Sigue las instrucciones — elige "Static"
```

O arrastra la carpeta a [vercel.com/new](https://vercel.com/new).

## 📂 Estructura

```
times-inc/
├── index.html      # HTML principal
├── style.css       # Estilos
├── app.js          # Lógica de la aplicación
├── firebase.js     # Firebase Auth (carga diferida)
├── sw.js           # Service Worker (PWA offline)
├── manifest.json   # PWA manifest
├── icon.svg        # Icono de la app
├── vercel.json     # Configuración Vercel
└── .gitignore
```

## 🔥 Configuración Firebase

En `firebase.js`, reemplaza la configuración con la tuya:

```js
apiKey: "AIzaSy...",
authDomain: "tu-proyecto.firebaseapp.com",
projectId: "tu-proyecto",
```

## 👤 Acceso Admin

- Email: `admin@times-inc.com` + contraseña Firebase
- O: Triple tap en el logo → botón admin visible

## 🔑 Acceso Empleados

1. Los empleados inician sesión con **email + contraseña** (Firebase Auth)
1. El email en Firebase debe coincidir con el email del empleado en la BD
1. Alternativa: modo **PIN numérico** (botón “Usar PIN numérico”)

## 📱 Instalar como PWA

- **iOS Safari**: Compartir → “Añadir a pantalla de inicio”
- **Android Chrome**: Banner automático o menú → “Instalar app”