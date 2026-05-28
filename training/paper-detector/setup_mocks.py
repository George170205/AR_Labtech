"""
setup_mocks.py
Crea modulos mock para que tensorflowjs importe correctamente en Windows
sin necesitar jax, jaxlib, flax ni tensorflow-decision-forests.
"""
import os

BASE = os.path.join("venv", "Lib", "site-packages")

# Mock universal: devuelve un objeto que acepta cualquier atributo/llamada
UNIVERSAL_MOCK = """\
class _M:
    def __getattr__(self, n): return _M()
    def __call__(self, *a, **k): return _M()
    def __iter__(self): return iter([])
    def __bool__(self): return False
    def __int__(self): return 0
    def __float__(self): return 0.0
    def __str__(self): return ''
    def __repr__(self): return '_M()'

# Module-level __getattr__: cualquier acceso a atributo del modulo
# que no exista devuelve un _M() en lugar de AttributeError
def __getattr__(name):
    return _M()
"""

mocks = {
    # jax — usa __getattr__ a nivel de modulo (Python 3.7+)
    os.path.join(BASE, "jax", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jax", "experimental", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jax", "experimental", "jax2tf.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jax", "numpy", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jax", "monitoring", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jax", "interpreters", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jax", "_src", "__init__.py"): UNIVERSAL_MOCK,

    # jaxlib
    os.path.join(BASE, "jaxlib", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "jaxlib", "xla_extension.py"): UNIVERSAL_MOCK,

    # flax
    os.path.join(BASE, "flax", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "flax", "linen", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "flax", "core", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "flax", "struct.py"): UNIVERSAL_MOCK,

    # orbax (tambien requerido por keras callbacks)
    os.path.join(BASE, "orbax", "__init__.py"): UNIVERSAL_MOCK,
    os.path.join(BASE, "orbax", "checkpoint", "__init__.py"): UNIVERSAL_MOCK,
}

for path, content in mocks.items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    print(f"  OK  {path}")

print("\nTodos los mocks creados correctamente.")
