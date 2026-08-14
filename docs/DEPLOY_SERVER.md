# Despliegue de Bizantino

Bizantino se instala de manera independiente en `/opt/bizantino`. No se debe
extraer dentro de `/opt/POS` ni reiniciar los contenedores de Yamal Sushi.

## Arquitectura

- `bizantino-app`: FastAPI, API y frontend.
- `bizantino-db`: PostgreSQL exclusivo de Bizantino.
- `bizantino_db`: volumen persistente de la base de datos.
- `bizantino_evidence`: volumen persistente de fotos del checador.
- Red privada propia para comunicarse con `bizantino-db`.
- Conexión adicional de `bizantino-app` a la red externa `pos_default`, donde
  Caddy puede resolverlo como `bizantino-app:8000`.
- URL pública prevista: `https://oeba.com.mx/bizantino/`.

## Preparación en el servidor

```bash
mkdir -p /opt/bizantino
```

Copiar el paquete a `/opt/`, extraerlo en `/opt/bizantino` y crear `.env` a
partir de `.env.production.example`. Las contraseñas reales nunca deben entrar
al repositorio ni al paquete compartido.

```bash
cd /opt/bizantino
cp .env.production.example .env
docker compose config
docker compose build --no-cache app
docker compose up -d
docker compose ps
docker compose logs --tail=100 app
docker compose exec app python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/api/health/database').read().decode())"
```

El contenedor ejecuta `alembic upgrade head` antes de iniciar Uvicorn.

## Ruta en Caddy

El bloque exacto debe adaptarse al Caddyfile existente. Si Caddy corre en el
host, la regla esperada es equivalente a:

```caddyfile
handle_path /bizantino/* {
    reverse_proxy bizantino-app:8000
}

redir /bizantino /bizantino/ 308
```

Antes de recargar Caddy se debe validar su configuración. No se debe reemplazar
el bloque de `/yamalsushi/`.

## Verificación

1. Confirmar `https://oeba.com.mx/yamalsushi/` antes y después del cambio.
2. Abrir `https://oeba.com.mx/bizantino/`.
3. Crear la cuenta administradora con `backend/manage_user.py` dentro del
   contenedor.
4. Probar inicio de sesión, turno, venta, checador, evidencia y cierre.
5. Confirmar que reiniciar `bizantino-app` conserva base de datos y evidencias.
