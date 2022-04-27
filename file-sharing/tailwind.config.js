module.exports = {
	content: [
		"./index.html",
		"./src/**/*.{vue,js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			colors: {
				neutral: {
					850: "#222222",
				}
			}
		},

	},
	plugins: [
		require('@tailwindcss/forms'),
	],
	darkMode: "class",
}
