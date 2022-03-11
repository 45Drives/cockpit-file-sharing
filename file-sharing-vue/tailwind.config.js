module.exports = {
	content: [
		"./index.html",
		"./src/**/*.{vue,js,ts,jsx,tsx}",
	],
	theme: {
		extend: {
			screens: {
				'mobile': { 'max': '500px' }
			}
		},

	},
	plugins: [
		require('@tailwindcss/forms'),
	],
	darkMode: "class",
}
