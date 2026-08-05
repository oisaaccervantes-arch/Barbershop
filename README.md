# Bizantino POS

Sistema de punto de venta para Bizantino Barbería. Administra el catálogo,
barberos, clientes, citas, ventas, pagos e historial por periodo.

> Estado: proyecto en desarrollo. La base actual es local y no corresponde a
> un entorno de producción.

## Funcionalidades actuales

- Catálogo de servicios, paquetes y extras.
- Alta, edición, activación y desactivación de barberos.
- Clientes identificados por número celular único de 10 dígitos.
- Citas pendientes, confirmadas, atendidas y canceladas.
- Ventas a clientes registrados o público general.
- Pagos en efectivo, tarjeta, transferencia y pagos mixtos.
- Cálculo de efectivo recibido y cambio.
- Tickets y reimpresión.
- Historial de ventas por fechas y barbero.
- Desglose de ventas por método de pago.

Las decisiones pendientes del negocio están registradas en
[docs/PENDING_DECISIONS.md](docs/PENDING_DECISIONS.md).

## Tecnologías

- Frontend: HTML, CSS y JavaScript.
- Backend: Python y FastAPI.
- Persistencia: PostgreSQL y SQLAlchemy.
- Migraciones: Alembic.

## Estructura

```text
Barbershop/
├── app.js
├── index.html
├── styles.css
├── README.md
├── docs/
│   └── PENDING_DECISIONS.md
└── backend/
    ├── app/
    │   ├── models/
    │   ├── routers/
    │   ├── schemas/
    │   ├── config.py
    │   ├── database.py
    │   └── main.py
    ├── migrations/
    ├── .env.example
    ├── alembic.ini
    └── requirements.txt
```

## Requisitos

- PostgreSQL 15 o posterior.
- Python 3.12 o posterior.
- Git.
- VS Code con Live Server, o cualquier servidor HTTP local para el frontend.

pgAdmin es opcional, pero facilita crear y consultar la base.

## Instalación local

### 1. Clonar el repositorio

```powershell
git clone URL_DEL_REPOSITORIO Barbershop
cd Barbershop
git switch desarrollo
```

### 2. Crear la base de datos

En PostgreSQL, crea una base independiente:

```sql
CREATE DATABASE bizantino_pos_dev;
```

En pgAdmin debe aparecer en:

```text
Servers
└── PostgreSQL 15
    └── Databases
        └── bizantino_pos_dev
```

No utilices la base de otro proyecto.

### 3. Preparar Python

Desde la raíz del repositorio:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Si PowerShell bloquea la activación:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 4. Configurar el entorno

```powershell
Copy-Item .env.example .env
code .env
```

Configura los datos locales:

```env
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=bizantino_pos_dev
DB_USER=postgres
DB_PASSWORD=TU_CONTRASEÑA
```

El archivo `backend/.env` contiene credenciales, está ignorado por Git y no
debe subirse al repositorio.

### 5. Aplicar las migraciones

Con el entorno virtual activo y desde `backend`:

```powershell
python -m alembic upgrade head
```

Esto crea y actualiza las tablas del sistema.

### 6. Iniciar FastAPI

```powershell
python -m uvicorn app.main:app --reload
```

Direcciones útiles:

- API: <http://127.0.0.1:8000/>
- Estado: <http://127.0.0.1:8000/api/health>
- PostgreSQL: <http://127.0.0.1:8000/api/health/database>
- Swagger: <http://127.0.0.1:8000/docs>

### 7. Iniciar el frontend

Mantén FastAPI encendido. En VS Code:

1. Haz clic derecho en `index.html`.
2. Selecciona **Open with Live Server**.
3. Abre la dirección que muestre Live Server.

No abras `index.html` directamente como archivo, porque el frontend necesita
realizar solicitudes HTTP a FastAPI.

## Uso diario en desarrollo

Terminal del backend:

```powershell
cd "C:\Users\TU_USUARIO\ruta\Barbershop\backend"
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload
```

Después inicia Live Server y recarga el navegador con `Ctrl+F5` cuando sea
necesario descartar archivos almacenados en caché.

Detén FastAPI con `Ctrl+C`.

## Base de datos

Las tablas principales son:

```text
services
barbers
customers
appointments
sales
sale_items
payments
alembic_version
```

Los datos reales se encuentran en PostgreSQL. GitHub conserva el código y las
migraciones, pero no conserva clientes, citas ni ventas.

Para confirmar la base activa:

```sql
SELECT current_database();
```

Debe devolver:

```text
bizantino_pos_dev
```

## Migraciones

Consultar la migración actual:

```powershell
python -m alembic current
```

Aplicar migraciones pendientes:

```powershell
python -m alembic upgrade head
```

Crear una migración después de modificar modelos:

```powershell
python -m alembic revision --autogenerate -m "descripcion del cambio"
```

Revisa siempre el archivo generado antes de aplicar la migración.

## Flujo de Git

El desarrollo se realiza en la rama `desarrollo`:

```powershell
git status
git add .
git commit -m "Descripcion del cambio"
git push
```

No subas `.env`, `.venv`, contraseñas ni respaldos con información real.

## Comprobaciones manuales

Antes de guardar una entrega, prueba:

1. Crear o identificar un cliente por teléfono.
2. Crear, confirmar y cobrar una cita.
3. Cobrar una venta a público general.
4. Cobrar en efectivo y verificar el cambio.
5. Cobrar con tarjeta.
6. Dividir un pago entre dos métodos.
7. Consultar la venta en el historial.
8. Filtrar por fechas y barbero.
9. Reimprimir el ticket.
10. Reiniciar FastAPI y confirmar que los datos permanezcan.

## Problemas comunes

### FastAPI no inicia

Confirma que la terminal esté en `backend`, que `.venv` esté activo y que
`backend/.env` exista.

### No conecta con PostgreSQL

- Confirma que el servicio PostgreSQL esté ejecutándose.
- Revisa host, puerto, base, usuario y contraseña en `.env`.
- Abre <http://127.0.0.1:8000/api/health/database>.

### No aparecen tablas en pgAdmin

Haz clic derecho en **Databases** o **Tables** y selecciona **Refresh**. Verifica
también que estés dentro de `bizantino_pos_dev`, no en `pos_db` u otra base.

### El frontend muestra datos anteriores

Confirma que FastAPI esté encendido y recarga con `Ctrl+F5`.

## Producción

La configuración actual es para desarrollo local. Antes de instalar el sistema
en la barbería se deben preparar:

- Servidor Linux o equipo local de producción.
- Usuario PostgreSQL exclusivo para la aplicación.
- Contraseñas de producción.
- HTTPS o acceso limitado a la red local.
- Respaldos automáticos y una restauración probada.
- Inicio de sesión y permisos.
- Reglas definitivas de apertura y corte de caja.

No copies el archivo `.env` de desarrollo directamente a producción.
