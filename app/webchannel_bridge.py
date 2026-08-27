"""Puente genérico expuesto a JavaScript vía QWebChannel (reemplaza el
js_api de pywebview): un solo método (`llamar`) que despacha por nombre
hacia Backend, con argumentos y respuesta codificados como JSON. Evita
tener que declarar cada uno de los ~30 métodos de Backend con una firma
@Slot() distinta para que QWebChannel los pueda enlazar automáticamente --
la validación real de argumentos ya la hace cada método de Backend."""
import json

from PySide6.QtCore import QObject, Slot

from app.backend import Backend


class Puente(QObject):
    def __init__(self, backend: Backend, parent=None):
        super().__init__(parent)
        self._backend = backend

    @Slot(str, str, result=str)
    def llamar(self, metodo: str, args_json: str) -> str:
        try:
            args = json.loads(args_json)
            fn = getattr(self._backend, metodo, None)
            if fn is None or metodo.startswith("_"):
                return json.dumps({"ok": False, "error": f"Método de API no encontrado: {metodo}", "data": None})
            resultado = fn(*args)
            return json.dumps(resultado)
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e), "data": None})
