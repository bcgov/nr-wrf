# Notes

Setting up network policies:
https://github.com/bcgov/how-to-workshops/tree/master/labs/netpol-quickstart

# helm chart

## deploy the chart - dev
```
oc project $WRFDEV
cd cicd
helm upgrade --install wrf-v1 wrf-helm -f values-dev.yaml
```

## deploy chart - test
```
oc project $WRFTEST
cd cicd
helm upgrade --install wrf-v1 wrf-helm -f values-dev.yaml -f values-test.yaml
```

## deploy chart - prod
```
oc project $WRFPROD
cd cicd
helm upgrade --install wrf-v1 wrf-helm -f values-dev.yaml -f values-test.yaml -f values-prod.yaml
```

# list deployed charts
` helm list `


# Deploy certbot
```
# build
oc process -n $NAMESPACE -f "https://raw.githubusercontent.com/franTarkenton/certbot/master/openshift/certbot.bc.yaml" | oc apply -n $NAMESPACE -f -

oc process -n $NAMESPACE -f "https://raw.githubusercontent.com/franTarkenton/certbot/master/openshift/certbot.dc.yaml" -p EMAIL=$EMAIL -p NAMESPACE=$NAMESPACE -p CERTBOT_SERVER=$CERTBOT_SERVER | oc apply -n $NAMESPACE -f -



```