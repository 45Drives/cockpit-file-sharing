import { createApp } from 'vue'

import App from './App.vue'
import router from './router'

import '@45drives/houston-common-css/src/index.css';
import '@45drives/houston-common-ui/style.css';

const app = createApp(App)

app.use(router)

app.mount('#app')
