import concurrent.futures, hashlib, json, pathlib, urllib.request, zipfile

root = pathlib.Path(__file__).resolve().parent.parent
cache = root / '.dev' / 'downloads'
cache.mkdir(parents=True, exist_ok=True)
opener = urllib.request.build_opener()
sources = {
    'ieee': 'https://mirrors.ctan.org/macros/latex/contrib/IEEEtran.zip',
    'acm': 'https://mirrors.mit.edu/CTAN/macros/latex/contrib/acmart.zip',
    'lncs': 'https://mirrors.mit.edu/CTAN/macros/latex/contrib/llncs.zip',
    'elsevier': 'https://mirrors.ctan.org/macros/latex/contrib/elsarticle.zip',
    'oup': 'https://mirrors.ctan.org/macros/latex/contrib/oup-authoring-template.zip',
    'neurips': 'https://media.neurips.cc/Conferences/NeurIPS2026/Formatting_Instructions_For_NeurIPS_2026.zip',
    'icml': 'https://media.icml.cc/Conferences/ICML2026/Styles/icml2026.zip',
    'iclr': 'https://github.com/ICLR/Master-Template/archive/refs/heads/master.zip',
    'acl': 'https://github.com/acl-org/acl-style-files/archive/refs/heads/master.zip',
    'cvpr': 'https://github.com/cvpr-org/author-kit/archive/refs/heads/main.zip',
    'plos': 'https://journals.plos.org/plosone/s/file?id=1457%2FPLOS_latex_template.zip',
    'springer': 'https://cms-resources.apps.public.k8s.springernature.io/springer-cms/rest/v1/content/18782940/data/v12',
}

def fetch(item):
    name, url = item
    dest = cache / (name + '.zip')
    try:
        if not dest.exists():
            with opener.open(urllib.request.Request(url, headers={'User-Agent': 'LaTeX-Studio-template-builder/0.1'}), timeout=90) as response:
                data = response.read()
            if not zipfile.is_zipfile(__import__('io').BytesIO(data)): raise ValueError('Not a ZIP archive')
            dest.write_bytes(data)
        data = dest.read_bytes()
        with zipfile.ZipFile(dest) as archive:
            names = archive.namelist()
        (cache / (name + '-source.json')).write_text(json.dumps({'url': url, 'sha256': hashlib.sha256(data).hexdigest(), 'files': names}, indent=2), encoding='utf-8')
        return name, len(data), names[:12]
    except Exception as exc:
        return name, 'ERROR', str(exc)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(fetch, sources.items()): print(json.dumps(result), flush=True)
