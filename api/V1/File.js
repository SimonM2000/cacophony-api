const models            = require('../../models');
const util              = require('./util');
const responseUtil      = require('./responseUtil');
const config            = require('../../config');
const jsonwebtoken      = require('jsonwebtoken');
const middleware        = require('../middleware');
const { query }  = require('express-validator/check');


module.exports = (app, baseUrl) => {
  var apiUrl = baseUrl + '/files';

  /**
   * @api {post} /api/v1/files Adds a new file.
   * @apiName PostUserFile
   * @apiGroup Files
   * @apiDescription This call is used for upload a file, eg an audio bait file.
   * is required:
   *
   * @apiUse V1UserAuthorizationHeader
   *
   * @apiParam {JSON} data Metadata about the recording in JSON format.  It must include the field 'type' (eg. audioBait).
   * @apiParam {File} file File of the recording.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {Number} recordingId ID of the recording.
   * @apiuse V1ResponseError
   */
  app.post(
    apiUrl,
    [
      middleware.authenticateUser,
    ],
    middleware.requestWrapper(
      util.multipartUpload((request, data, key) => {
        var dbRecord = models.File.build(data, {
          fields: models.File.apiSettableFields,
        });
        dbRecord.set('UserId', request.user.id);
        dbRecord.set('fileKey', key);
        return dbRecord;
      })
    )
  );

  /**
   * @api {get} /api/v1/files Query available files
   * @apiName QueryFiles
   * @apiGroup Files
   *
   * @apiHeader {String} Authorization Signed JSON web token for a user or device.
   *
   * @apiUse QueryParams
   *
   * @apiUse V1ResponseSuccessQuery
   */
  app.get(
    apiUrl,
    [
      middleware.authenticateUser,
      middleware.parseJSON('where'),
      query('offset').isInt().optional(),
      query('limit').isInt().optional(),
      middleware.parseJSON('order').optional(),
    ],
    middleware.requestWrapper(async (request, response) => {

      if (request.query.offset == null) {
        request.query.offset = '0';
      }

      if (request.query.offset == null) {
        request.query.limit = '100';
      }

      var result = await models.File.query(
        request.query.where,
        request.query.offset,
        request.query.limit,
        request.query.order);

      return responseUtil.send(response, {
        statusCode: 200,
        success: true,
        messages: ["Completed query."],
        limit: request.query.limit,
        offset: request.query.offset,
        count: result.count,
        rows: result.rows,
      });
    })
  );

  /**
   * @api {get} /api/v1/files/id Get a file
   * @apiName GetFile
   * @apiGroup Files
   * @apiUse MetaDataAndJWT
   *
   * @apiHeader {String} Authorization Signed JSON web token for either a user or a device.
   *
   * @apiUse V1ResponseSuccess
   * @apiSuccess {String} jwt JSON Web Token to use to download the
   * recording file.
   * @apiSuccess {JSON} file Metadata for the file.
   *
   * @apiUse V1ResponseError
   */
  app.get(
    apiUrl + '/:id',
    [
      middleware.authenticateAny,
      middleware.getFileById,
    ],
    middleware.requestWrapper(async (request, response) => {

      var file = request.body.file;

      var downloadFileData = {
        _type: 'fileDownload',
        key: file.fileKey,
      };

      return responseUtil.send(response, {
        statusCode: 200,
        success: true,
        messages: [],
        file: file,
        jwt: jsonwebtoken.sign(
          downloadFileData,
          config.server.passportSecret,
          { expiresIn: 60 * 10 }
        ),
      });
    })
  );

  /**
  * @api {delete} /api/v1/files/:id Delete an existing files
  * @apiName DeleteFile
  * @apiGroup Files
  * @apiDescription This call deletes a file.  The user making the
  * call must have uploaded the file or be an administrator.
  *
  * [/api/v1/signedUrl API](#api-SignedUrl-GetFile).
  *
  * @apiUse V1UserAuthorizationHeader
  *
  * @apiUse V1ResponseSuccess
  * @apiUse V1ResponseError
  */
  app.delete(
    apiUrl + '/:id',
    [
      middleware.authenticateUser,
      middleware.getFileById,
    ],
    middleware.requestWrapper(async (request, response) => {

      var deleted = await models.File.deleteIfAllowed(request.user, request.body.file);
      if (deleted) {
        responseUtil.send(response, {
          statusCode: 200,
          success: true,
          messages: ["Deleted file."],
        });
      } else {
        responseUtil.send(response, {
          statusCode: 400,
          success: false,
          messages: ["Failed to delete file. Files can only be deleted by the admins and the person who uploaded the file."],
        });
      }
    })
  );
};
