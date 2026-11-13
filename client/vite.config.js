import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwind()],server:{port:5173,strictPort:true,allowedHosts:['.ngrok-free.app','.ngrok.app','.ngrok.io'],proxy:{'/api':process.env.PULSE_API_TARGET||'http://127.0.0.1:3001'}}});
