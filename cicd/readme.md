# Notes

Setting up network policies:
https://github.com/bcgov/how-to-workshops/tree/master/labs/netpol-quickstart

# helm chart

## deploy the chart - dev
```
cd cicd
helm upgrade --install wrf-v1 wrf-helm -f values-dev.yaml
```

## deploy the chart - test
```
cd cicd
helm upgrade --install wrf-v1 wrf-helm -f values-dev.yaml -f values-test.yaml
```


# list deployed charts
` helm list `
