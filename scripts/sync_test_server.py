"""Loopback-only integration fixture. Test cookies are never used in deployment."""
import os
from pathlib import Path
import sys
import tempfile
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from account_sync import create_sync_router
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, Response
import uvicorn

root = Path(os.environ.get('SYNC_TEST_SITE', str(Path(__file__).resolve().parents[1] / 'site'))).resolve()
temporary = tempfile.TemporaryDirectory()
app = FastAPI()


def authorize(request):
    name = request.cookies.get('test-account')
    if name not in ('alice', 'bob', 'charlie'):
        raise HTTPException(401)
    return {'username': name}


def origin(request):
    if request.headers.get('origin') != str(request.base_url).rstrip('/'):
        raise HTTPException(403)
    if not request.headers.get('content-type', '').startswith('application/json'):
        raise HTTPException(415)


app.include_router(create_sync_router(temporary.name, authorize, origin), prefix='/arcade')


@app.get('/arcade/auth/session')
def session(request: Request):
    return authorize(request)


@app.get('/health')
def health():
    return {'ok': True}


@app.get('/arcade/library/catalog.json')
def catalog():
    return {'games':[{'id':'dino', 'title':'恐龙快打', 'filename':'dino.zip', 'rom':'/roms/dino.zip',
                     'core':'fbneo','category':'动作街机','publisher':'CAPCOM','cover':'','aliases':''}],
            'categories':{'动作街机':1}}


@app.get('/arcade/{path:path}')
def files(path: str):
    path = path or 'library/index.html'
    if path.endswith('/'):
        path += 'index.html'
    file = (root / path).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        raise HTTPException(404)
    if file.suffix == '.html':
        text=file.read_text(encoding='utf-8')
        if not os.environ.get('SYNC_TEST_SITE'):
            text=text.replace('/library/', '/arcade/library/')
        return Response(text, media_type='text/html')
    return FileResponse(file)


if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=int(os.environ.get('SYNC_TEST_PORT', '18896')), log_level='error')
