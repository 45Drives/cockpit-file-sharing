import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [vue()],
	base: "./",
	build: {
		target: [
			"chrome87", "edge88", "firefox78", "safari14"
		],
	},
})
