""" Utility module to make it easy to query and publish individual objects in
a bucket.

Works with constant file that makes the following env vars available:
OBJ_STORE_BUCKET    - Bucket name
OBJ_STORE_SECRET    - account secret access key (to access bucket)
OBJ_STORE_USER      - account name / access key id
OBJ_STORE_HOST      - object store host

"""

import logging

import boto3
import minio
import os

import constants

LOGGER = logging.getLogger(__name__)


class ObjectStoreUtil:
    def __init__(self, objStoreHost=None, objStoreUser=None,
                 objStoreSecret=None, objStoreBucket=None, tmpfolder=None):
        """[summary]

        :param objStoreHost: [if provided will use this as the object storage
                             host, if not will use the host described in the
                             environment variable: OBJ_STORE_HOST]
        :type objStoreHost: [type], optional
        :param objStoreUser: [description], defaults to None
        :type objStoreUser: [type], optional
        :param objStoreSecret: [description], defaults to None
        :type objStoreSecret: [type], optional
        """
        self.objStoreHost = objStoreHost
        self.objStoreUser = objStoreUser
        self.objStoreSecret = objStoreSecret
        self.objStoreBucket = objStoreBucket
        self.tmpfolder = tmpfolder

        if self.objStoreHost is None:
            self.objStoreHost = constants.OBJ_STORE_HOST
        if self.objStoreUser is None:
            self.objStoreUser = constants.OBJ_STORE_USER
        if self.objStoreSecret is None:
            self.objStoreSecret = constants.OBJ_STORE_SECRET
        if self.objStoreBucket is None:
            self.objStoreBucket = constants.OBJ_STORE_BUCKET
        # populate a temp folder variable.. if none is provided as an
        # arg or in a constants variable then just use the current
        # directory
        if self.tmpfolder is None:
            if hasattr(constants, 'TMP_FOLDER'):
                self.tmpfolder = constants.TMP_FOLDER
            else:
                self.tmpfolder = os.path.dirname(__file__)

        LOGGER.debug(f"obj store host: {self.objStoreHost}")
        self.minIoClient = minio.Minio(
            self.objStoreHost,
            self.objStoreUser,
            self.objStoreSecret,
        )
        # minio doesn't provide access to ACL's for buckets and objects
        # so using boto when that is required.  Methods that use the boto
        # client will create the object only when called
        self.botoClient = None
        self.botoSession = None

    def getObject(self, filePath, localPath, bucketName=None):
        if not bucketName:
            bucketName = self.objStoreBucket
        retVal = self.minIoClient.fget_object(
            bucket_name=bucketName,
            object_name=filePath,
            file_path=localPath
        )
        #retDict = self.getObjAsDict(retVal)
        #LOGGER.debug(f"object get response: {retDict}")

    def putObject(self, destPath, localPath, bucketName=None):
        """just a wrapper method around the minio fput.  Makes it a
        little easier to call.

        :param localPath: the path to the file in the locally accessible file
                          system
        :type localPath: str
        :param destPath: the path in the object storage where the file should
                         be written.
        :type destPath:
        :param bucketName: [description], defaults to None
        :type bucketName: [type], optional
        """
        if not bucketName:
            bucketName = self.objStoreBucket

        retVal = self.minIoClient.fput_object(
            bucket_name=bucketName,
            object_name=destPath,
            file_path=localPath
        )
        #retDict = self.getObjAsDict(retVal)
        #LOGGER.debug(f'object store returned: {retDict}')



    def listObjects(self, inDir=None, recursive=True, returnFileNamesOnly=False):
        """lists the objects in the object store.  Run's recursive, if
        inDir arg is provided only lists objects that fall under that
        directory

        :param inDir: The input directory who's objects are to be listed
                      if no value is provided will list all objects in the
                      bucket
        :type inDir: str
        :return: list of the object names in the bucket
        :rtype: list
        """
        objects = self.minIoClient.list_objects(
            self.objStoreBucket, recursive=recursive, prefix=inDir
        )
        retVal = objects
        if returnFileNamesOnly:
            retVal = []
            for obj in objects:
                retVal.append(obj.object_name)

        return retVal

    def logObjectProperties(self, inObject):
        """write to the log the properties / values of the specified
        object

        :param inObject: gets a python object and writes the property / values
                         to the debug log
        :type inObject: obj
        """
        for attr in dir(inObject):
            LOGGER.debug("obj.%s = %r" % (attr, getattr(inObject, attr)))

    def getObjAsDict(self, inObject):
        """Gets an object, iterates over the properties... any properties that
        do not start with a '_' are copied to a dict.  Not recursive, ie
        if properties are objects, then will just create an entry in the
        dictionary with value=object.

        :param inObject: The input object that is to be converted to a
                         dictionary
        :type inObject: obj
        :return: dictionary of the input object
        :rtype: dict
        """
        retDict = {}
        for attr in dir(inObject):
            if attr[0] != '_':
                retDict[attr] = getattr(inObject, attr)

        return retDict

    def statObject(self, objectName):
        """runs stat on an object in the object store, returns the stat object

        :param objectName: name of the object to run stat on
        :type objectName: str
        """
        stat = self.minIoClient.stat_object(
                    self.objStoreBucket,
                    objectName)
        # self.__logObjectProperties(stat)
        return stat

    def createBotoClient(self, objStoreUser=None, objectStoreSecret=None,
                         objStoreHost=None):
        """Checks to see if a boto connection has been made, if not then
        uses the following constants to build the connection:

        client id:      constants.OBJ_STORE_USER
        client secret:  constants.OBJ_STORE_SECRET
        s3 host:        constants.OBJ_STORE_HOST
        """
        if objStoreUser is None:
            objStoreUser = self.objStoreUser
        if objectStoreSecret is None:
            objStoreSecret = self.objStoreSecret
        if objStoreHost is None:
            objStoreHost = self.objStoreHost

        if self.botoSession is None:
            self.botoSession = boto3.session.Session()

        # aws_access_key_id - A specific AWS access key ID.
        # aws_secret_access_key - A specific AWS secret access key.
        # region_name - The AWS Region where you want to create new
        #               connections.
        # profile_name - The profile to use when creating your session.

        if self.botoClient is None:
            self.botoClient = self.botoSession.client(
                service_name="s3",
                aws_access_key_id=objStoreUser,
                aws_secret_access_key=objStoreSecret,
                endpoint_url=f"https://{objStoreHost}",
            )

    def getPublicPermission(self, objectName, objStoreBucket):
        """uses the boto3 module to communicate with the S3 service and retrieve
        the ACL's.  Parses the acl and return the permission that is associated
        with public access.

        :param objectName: name of the object who's permissions are to be
                           retrieved
        :type objectName: str
        :raises ValueError: error raise if more than one
        :return: the permission that is associated with public access to the
                 object if no public permission has been defined then returns
                 None.
        :rtype: str

        following is an example of the 'Grants' property of the object that is
        returned by the get_object_acl method

        Grants': [
            {
                'Grantee':
                    {'DisplayName': 'nr-wrf-prd',
                    'ID': 'nr-wrf-prd',
                    Type': 'CanonicalUser'},
                'Permission': 'FULL_CONTROL'
            },
           {
               'Grantee':
                    {'Type': 'Group',
                    'URI': 'http://acs.amazonaws.com/groups/global/AllUsers'},
                'Permission': 'READ'}]
            }

        ^^ where Grantee / Type is Group, URI is ALLUsers is what the method
        is looking for.  Also only expecting a single record that meets those
        criteria
        """
        if objStoreBucket is None:
            objStoreBucket = self.objStoreBucket

        self.createBotoClient()
        permission = None
        results = self.botoClient.get_object_acl(
            Bucket=objStoreBucket, Key=objectName
        )
        LOGGER.debug(f"ACL permissions: {results}")
        for grants in results["Grants"]:
            if (
                "Grantee" in grants
                and "Type" in grants["Grantee"]
                and grants["Grantee"]["Type"] == "Group"
                and "URI" in grants["Grantee"]
                and "AllUsers".lower() in grants["Grantee"]["URI"].lower()
            ):
                if permission is not None:
                    msg = (
                        f"return object is: {results}, expecting it"
                        + "to only contain a single public permission but  "
                        + "have found >1. Public permissions are defined "
                        + 'under the property "Grants"-"Grantee"-"Type" = '
                        + "Group and allusers in the uri"
                    )
                    raise ValueError(msg)
                # print(f'grant:   {grants}')
                permission = grants["Permission"]
        return permission

    def setPublicPermissions(self, objectName, objStoreBucket=None):
        """Sets the input object that exists in object store to be public
        Read.

        Using boto3 to accomplish this, but suspect that there is another way
        to do this, possibly interacting directly with the object store api.

        The following post: https://github.com/aws/aws-sdk-ruby/issues/2129
        suggests that you might be able to set the object as read when the
        data is uploaded by adding the parameter:

                x-amz-acl = public-read


        https://stackoverflow.com/questions/67315838/upload-images-as-image-jpeg-mime-type-from-flutter-to-s3-bucket/67848626#67848626

        :param objectName: [description]
        :type objectName: [type]
        """
        if objStoreBucket is None:
            objStoreBucket = self.objStoreBucket

        resp = self.botoClient.put_object_acl(
                    ACL="public-read",
                    Bucket=objStoreBucket,
                    Key=objectName
        )
        LOGGER.debug(f"resp: {resp}")

    def getPresignedUrl(self, objectName, objectBucket=None):
        """
        Gets the name of an object and returns the presigned url

        :param objectName: object name / key that exists in the object store
        :type objectName: str
        """
        if objectBucket is None:
            objectBucket = self.objStoreBucket

        presignUrl = self.minIoClient.get_presigned_url(
            bucket_name=objectBucket,
            object_name=objectName,
            method="GET"
        )
        return presignUrl

    def testPutPerms(self):
        objFile = "ajunk.txt"
        # uploads a file
        # self.minIoClient.fput_object(
        #     constants.OBJ_STORE_BUCKET,
        #     objFile,
        #     './python-objstore/junk.txt'
        # )
        # gets the files default permissions
        perms = self.getPublicPermission(objFile)
        LOGGER.debug(f"perms: {perms}")

        # resp = self.minIoClient.get_presigned_url(
        #     bucket_name=constants.OBJ_STORE_BUCKET,
        #     object_name=objFile,
        #     method='GET')
        # LOGGER.debug(f"presign: {resp}")

        # sets the permissions to public / read
        # self.setPublicPermissions(objFile)
