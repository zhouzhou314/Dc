import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import './style.css'

// 创建 Vue 应用，全局注册 Element Plus（中文语言包）
createApp(App)
  .use(ElementPlus, { locale: zhCn })
  .mount('#app')
