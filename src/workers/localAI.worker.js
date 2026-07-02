// Worker dedicado para WebLLM — la inferencia corre aquí, fuera del hilo principal,
// para que el chat no bloquee la UI mientras el modelo "piensa" en el móvil.
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
self.onmessage = (msg) => handler.onmessage(msg)
