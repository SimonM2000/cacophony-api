import json
import os
import requests
from urllib.parse import urljoin

from requests_toolbelt.multipart.encoder import MultipartEncoder


class APIBase:

    def __init__(self, logintype, baseurl, loginname, password='password'):
        self._baseurl = baseurl
        self._loginname = loginname
        self._logintype = logintype
        self._password = password

    def login(self):
        url = urljoin(self._baseurl, "/authenticate_" + self._logintype)
        response = requests.post(url, data=self._create_login_and_password_map())

        if response.status_code == 200:
            self._set_jwt_token(response)
        elif response.status_code == 422:
            raise ValueError("Could not log on as '{}'.  Please check {} name.".format(self._loginname, self._logintype))
        elif response.status_code == 401:
            raise ValueError("Could not log on as '{}'.  Please check password.".format(self._loginname))
        else:
            response.raise_for_status()

        return self

    def register_as_new(self, group = None):
        url = urljoin(self._baseurl, "/api/v1/{}s".format(self._logintype))
        data = self._create_login_and_password_map()

        if group:
            data['group'] = group

        response = requests.post(url, data=data)

        if response.status_code == 200:
            self._set_jwt_token(response)
        else:
            self._check_response(response)

        return self


    def _create_login_and_password_map(self):
        nameProp = self._logintype + 'name'
        return {
                nameProp: self._loginname,
                'password': self._password
        }

    def _set_jwt_token(self, response):
        self._token = response.json().get('token')
        self._auth_header = {'Authorization': self._token}


    def _check_response(self, response):
        if not response.status_code == 200:
            raise IOError("request failed ({}): {}".format(response.status_code, response.text))
        return response.json()

    def get_login_name(self):
        return self._loginname

    def _download_signed(self, token):
        response = requests.get(
            urljoin(self._baseurl, '/api/v1/signedUrl'),
            params={'jwt': token},
            stream=True)
        response.raise_for_status()
        yield from response.iter_content(chunk_size=4096)

    def download_file(self, file_id):
        url = urljoin(self._baseurl, '/api/v1/files/{}'.format(file_id))
        response = requests.get(url, headers=self._auth_header)
        self._check_response(response)
        return self._download_signed(response.json()['jwt'])

    def _upload(self, url, filename, props):
        url = urljoin(self._baseurl, url)
        json_props = json.dumps(props)

        with open(filename, 'rb') as content:
            multipart_data = MultipartEncoder(
                fields={
                    'data': json_props,
                    'file': (os.path.basename(filename), content),
                })
            headers = {
                'Content-Type': multipart_data.content_type,
                'Authorization': self._token
            }
            r = requests.post(url, data=multipart_data, headers=headers)
        self._check_response(r)
        return r.json()['recordingId']