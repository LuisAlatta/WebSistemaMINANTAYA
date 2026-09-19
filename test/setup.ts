import { env } from 'cloudflare:test';

// Los tests conservan el actor de desarrollo sin habilitarlo en el Worker desplegado.
(env as unknown as { APP_ENV: string }).APP_ENV = 'development';
