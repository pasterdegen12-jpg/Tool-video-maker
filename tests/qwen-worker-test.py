"""CPU-only worker safety checks; no Gateway, model or external HTTP."""
import importlib.util
import io
from pathlib import Path
import unittest
from PIL import Image

spec = importlib.util.spec_from_file_location('worker', Path(__file__).parents[1] / 'scripts/qwen-outbound-worker.py')
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    def test_canonical_url_only(self):
        origin = 'https://media.example.com'
        worker.validate_image_url(origin + '/project_proj_test/avatar.jpg', origin, 'proj_test')
        for url in ['http://127.0.0.1/x', 'file:///x', origin + '/project_other/x', origin + '/project_proj_test/x?x=1', origin + '/project_proj_test/%2e%2e/x']:
            with self.assertRaises(ValueError):
                worker.validate_image_url(url, origin, 'proj_test')

    def test_copy_preserves_original_dimensions_and_aspect(self):
        out = io.BytesIO()
        Image.new('RGB', (1536, 2752), 'white').save(out, 'PNG')
        original = out.getvalue()
        result = worker.image_copy(original)
        self.assertLessEqual(len(result), 512000)
        with Image.open(io.BytesIO(result)) as image:
            self.assertEqual(image.size, (500, 896))
        with Image.open(io.BytesIO(original)) as image:
            self.assertEqual(image.size, (1536, 2752))

    def test_invalid_and_animated_inputs(self):
        with self.assertRaises((ValueError, OSError)):
            worker.image_copy(b'not an image')
        out = io.BytesIO()
        Image.new('RGB', (32, 32)).save(out, 'GIF')
        with self.assertRaises(ValueError):
            worker.image_copy(out.getvalue())


if __name__ == '__main__':
    unittest.main()
