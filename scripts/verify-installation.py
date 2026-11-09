import hashlib
import json
import pathlib
import tarfile
import sys

archive_path = pathlib.Path(sys.argv[1])
installed = pathlib.Path(sys.argv[2])
checked = 0
with tarfile.open(archive_path) as archive:
    for member in archive.getmembers():
        if not member.isfile():
            continue
        relative = pathlib.PurePosixPath(member.name).relative_to('package')
        expected = archive.extractfile(member).read()
        actual = (installed / relative).read_bytes()
        assert actual == expected, f'Installed file differs: {relative}'
        checked += 1
report = {
    'package': archive_path.name,
    'size': archive_path.stat().st_size,
    'sha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(),
    'filesCompared': checked,
    'allEqual': True,
    'installedDirectory': str(installed),
}
pathlib.Path('test-output/installation-results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
